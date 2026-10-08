export function analyzeGraph(manifest, entry) {
  const reachable = new Set();
  const missing = [];
  const edges = new Map();
  const dynamicSources = new Map();
  const queue = (Array.isArray(entry) ? entry : [entry]).map((key) => ({ key, from: null }));
  for (let index = 0; index < queue.length; index += 1) {
    const { key, from } = queue[index];
    if (!Object.hasOwn(manifest, key)) {
      if (!missing.some((item) => item.key === key && item.from === from)) missing.push({ key, from });
      continue;
    }
    if (reachable.has(key)) continue;
    reachable.add(key);
    const links = [
      ...(manifest[key].imports ?? []).map((to) => ({ to, weight: 0 })),
      ...(manifest[key].dynamicImports ?? []).map((to) => ({ to, weight: 1 })),
    ];
    edges.set(key, links);
    for (const { to, weight } of links) {
      queue.push({ key: to, from: key });
      if (weight) {
        if (!dynamicSources.has(to)) dynamicSources.set(to, new Set());
        dynamicSources.get(to).add(key);
      }
    }
  }

  // Collapse static cycles and share DAG work; only mixed/dynamic components
  // need path-specific states to avoid revisiting already imported modules.
  const order = [];
  const seen = new Set();
  for (const key of reachable) {
    if (seen.has(key)) continue;
    seen.add(key);
    const stack = [{ key, index: 0 }];
    while (stack.length) {
      const frame = stack.at(-1);
      const links = edges.get(frame.key);
      if (frame.index === links.length) {
        order.push(frame.key);
        stack.pop();
      } else {
        const child = links[frame.index++].to;
        if (reachable.has(child) && !seen.has(child)) {
          seen.add(child);
          stack.push({ key: child, index: 0 });
        }
      }
    }
  }
  const reverse = new Map([...reachable].map((key) => [key, []]));
  for (const [key, links] of edges) for (const { to } of links) reverse.get(to)?.push(key);
  const componentFor = new Map();
  const components = [];
  for (const key of order.reverse()) {
    if (componentFor.has(key)) continue;
    const component = components.length;
    const members = [];
    const stack = [key];
    componentFor.set(key, component);
    while (stack.length) {
      const current = stack.pop();
      members.push(current);
      for (const parent of reverse.get(current)) if (!componentFor.has(parent)) {
        componentFor.set(parent, component);
        stack.push(parent);
      }
    }
    components.push({ members, links: new Map(), indegree: 0, dynamicCycle: false });
  }
  for (const [key, links] of edges) {
    const source = componentFor.get(key);
    for (const { to, weight } of links) {
      if (!componentFor.has(to)) continue;
      const target = componentFor.get(to);
      if (source === target) {
        if (weight) components[source].dynamicCycle = true;
      } else {
        const links = components[source].links;
        if (!links.has(target)) components[target].indegree += 1;
        links.set(target, Math.max(links.get(target) ?? 0, weight));
      }
    }
  }
  const initialKeys = new Set();
  const initialQueue = Array.isArray(entry) ? [...entry] : [entry];
  for (let index = 0; index < initialQueue.length; index += 1) {
    const key = initialQueue[index];
    if (!reachable.has(key) || initialKeys.has(key)) continue;
    initialKeys.add(key);
    for (const { to, weight } of edges.get(key)) if (weight === 0) initialQueue.push(to);
  }
  const depths = new Map([...reachable].map((key) => [key, initialKeys.has(key) ? 0 : -Infinity]));
  const ready = components.flatMap((component, index) => component.indegree === 0 ? [index] : []);
  for (let index = 0; index < ready.length; index += 1) {
    const componentId = ready[index];
    const current = components[componentId];
    if (!current.dynamicCycle) {
      const depth = current.members.reduce((max, key) => Math.max(max, depths.get(key)), -Infinity);
      for (const key of current.members) depths.set(key, depth);
    } else {
      const bits = new Map(current.members.map((key, index) => [key, 1n << BigInt(index)]));
      const states = new Map(current.members.map((key) => [key, new Map()]));
      const stack = [];
      let stateCount = 0;
      const enqueue = (key, visited, depth) => {
        const previous = states.get(key).get(visited);
        if (previous !== undefined && previous >= depth) return;
        if (previous === undefined && ++stateCount > 10000) {
          throw new Error("GRAPH_ANALYSIS_LIMIT: mixed/dynamic cycle exceeds 10000 path states; simplify the cycle or inspect it separately; dynamic depth remains unverified");
        }
        states.get(key).set(visited, depth);
        stack.push({ key, visited, depth });
      };
      for (const key of current.members) {
        if (Number.isFinite(depths.get(key))) enqueue(key, bits.get(key), depths.get(key));
      }
      while (stack.length) {
        const { key, visited, depth } = stack.pop();
        if (states.get(key).get(visited) !== depth) continue;
        depths.set(key, Math.max(depths.get(key), depth));
        for (const { to, weight } of edges.get(key)) {
          if (componentFor.get(to) !== componentId || initialKeys.has(to)) continue;
          const bit = bits.get(to);
          if ((visited & bit) === 0n) enqueue(to, visited | bit, depth + weight);
        }
      }
    }
    for (const key of current.members) {
      for (const { to, weight } of edges.get(key)) {
        if (!componentFor.has(to) || componentFor.get(to) === componentId || initialKeys.has(to)) continue;
        depths.set(to, Math.max(depths.get(to), depths.get(key) + weight));
      }
    }
    for (const target of current.links.keys()) {
      components[target].indegree -= 1;
      if (components[target].indegree === 0) ready.push(target);
    }
  }
  const depth = [...depths.values()].reduce((max, value) => Math.max(max, value), 0);
  return {
    reachableKeys: [...reachable].sort(),
    missing,
    potentialDynamicDepth: Number.isFinite(depth) ? depth : null,
    hasDynamicCycle: components.some((component) => component.dynamicCycle),
    potentialDynamicImports: [...dynamicSources].sort(([a], [b]) => a.localeCompare(b)).map(([key, sources]) => {
      const depth = depths.get(key);
      return {
        key,
        file: Object.hasOwn(manifest, key) ? manifest[key].file : null,
        potentialDynamicDepth: Number.isFinite(depth) ? depth : null,
        importedBy: [...sources].sort(),
      };
    }),
  };
}
