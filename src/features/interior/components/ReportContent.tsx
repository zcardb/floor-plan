import { useContext, useEffect, useState } from "react";
import { buildReport, type ReportModel } from "../model/report";
import { serializeSvg } from "../model/svgExport";
import type { Design } from "../model/types";
import { CostDefaultsContext } from "./CostDefaultsContext";
import { ReportLoading } from "./ReportLoading";
import { ReportView } from "./ReportView";

interface Built { model: ReportModel; planSrc: string | null }

const build = (design: Design, defaults: React.ContextType<typeof CostDefaultsContext>, name: string): Built => {
  const model = buildReport(design, defaults, { name });
  const planSrc = model.plan ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(serializeSvg(model.plan, { title: model.info.name })) : null;
  return { model, planSrc };
};

/**
 * 报告弹窗的正文：按需懒加载。报告模型与平面图要算一阵，所以先让弹窗与 Loading 画出来，
 * 下一帧之后再计算，算完替换成正文。
 */
export function ReportContent({ design, name }: { design: Design; name: string }) {
  const defaults = useContext(CostDefaultsContext);
  const [built, setBuilt] = useState<Built | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // 等浏览器画完这一帧（弹窗 + Loading）再开始同步计算，避免点击后界面卡住没有反馈。
    const frame = requestAnimationFrame(() => { timer = setTimeout(() => setBuilt(build(design, defaults, name)), 0); });
    return () => { cancelAnimationFrame(frame); if (timer !== undefined) clearTimeout(timer); };
  }, [design, defaults, name]);
  return built ? <ReportView model={built.model} planSrc={built.planSrc} /> : <ReportLoading />;
}
