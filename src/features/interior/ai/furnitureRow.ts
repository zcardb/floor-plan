import type { Database } from "@/integrations/supabase/types";
import type { LibraryItem } from "../model/types";
import { sanitizeModel3d } from "../model/furniture3d";

type FurnitureRow = Database["public"]["Tables"]["interior_furniture_catalog"]["Row"];

/** 账号家具库的一行 → 素材条目。 */
export const furnitureFromRow = (r: FurnitureRow): LibraryItem => ({
  catalogId: r.catalog_id,
  name: r.name,
  category: r.category,
  type: r.type,
  shape: r.shape as LibraryItem["shape"],
  w: Number(r.width),
  d: Number(r.depth),
  height: Number(r.height),
  color: r.color,
  price: r.price === null ? null : Number(r.price),
  imageUrl: r.image_url || undefined,
  image3dUrl: r.image_3d_url || undefined,
  model3d: sanitizeModel3d(r.model_3d) ?? undefined,
});
