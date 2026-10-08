import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { LibraryItem } from "../model/types";
export function useFurnitureCatalog() {
  const [items, setItems] = useState<LibraryItem[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const epoch=useRef(0);
  const reset=useCallback(()=>{epoch.current++;setItems([]);setError('');setLoading(false);},[]);
  const load = useCallback(async () => {
    const run=++epoch.current;
    setLoading(true);
    setError("");
    const { data, error } = await supabase
      .from("interior_furniture_catalog")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if(run!==epoch.current)return;
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setItems(
      data.map((r) => ({
        catalogId: r.catalog_id,
        name: r.name,
        category: r.category,
        type: r.type,
        w: Number(r.width),
        d: Number(r.depth),
        height: Number(r.height),
        color: r.color,
        price: r.price === null ? null : Number(r.price),
        imageUrl: r.image_url || undefined,
      })),
    );
  }, []);
  const save = useCallback(async (item: LibraryItem) => {
    const { error } = await supabase
      .from("interior_furniture_catalog")
      .upsert(
        {
          catalog_id: item.catalogId!,
          name: item.name,
          category: item.category,
          type: item.type,
          width: item.w,
          depth: item.d,
          height: item.height || 700,
          color: item.color,
          price: item.price ?? null,
          image_url: item.imageUrl || null,
        },
        { onConflict: "owner_id,catalog_id" },
      );
    if (error) throw new Error(error.message);
    return true;
  }, []);
  return { items, loading, error, load, save, reset };
}
