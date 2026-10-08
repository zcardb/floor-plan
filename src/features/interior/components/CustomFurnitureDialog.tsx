import { useEffect, useRef, useState } from "react";
import { Plus, Sparkles, Loader2, Cloud, Image } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { categories, library } from "../data/catalog";
import { uid, type LibraryItem } from "../model/types";
import { validPrice } from "../model/costs";
import { useFurnitureImage } from "../cloud/useFurnitureImage";
import { useFurnitureCatalog } from "../cloud/useFurnitureCatalog";
export function CustomFurnitureDialog({
  open,
  onOpenChange,
  loggedIn,
  login,
  onCreate,
  onImport,
  ownerKey,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loggedIn: boolean;
  login: () => void;
  onCreate: (i: LibraryItem) => void;
  onImport: (i: LibraryItem) => void;
  ownerKey: string;
}) {
  const [name, setName] = useState(""),
    [category, setCategory] = useState("客厅"),
    [type, setType] = useState("sofa"),
    [w, setW] = useState("1800"),
    [d, setD] = useState("800"),
    [h, setH] = useState("800"),
    [price, setPrice] = useState(""),
    [color, setColor] = useState("#b7c4b0"),
    [prompt, setPrompt] = useState(""),
    [account, setAccount] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState<LibraryItem | null>(null),
    [saving, setSaving] = useState(false),
    [tab, setTab] = useState("create");
  const ai = useFurnitureImage(),
    cancelImage = ai.cancel,
    catalog = useFurnitureCatalog(), resetCatalog=catalog.reset,
    previousOwner = useRef(ownerKey),
    previousOpen = useRef(open);
  useEffect(() => {
    if (previousOwner.current !== ownerKey || (!open && previousOpen.current))
      cancelImage();
    if(previousOwner.current!==ownerKey){resetCatalog();setRetry(null);}
    previousOwner.current = ownerKey;
    previousOpen.current = open;
  }, [open, ownerKey, cancelImage, resetCatalog]);
  const types = [...new Map(library.map((l) => [l.type, l])).values()];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="custom-furniture-dialog">
        <DialogHeader>
          <DialogTitle>新建你的家具</DialogTitle>
          <DialogDescription>
            保存到当前项目，可选同时加入账号库。AI
            图片仅为外观预览，画布使用参考模型。
          </DialogDescription>
        </DialogHeader>
        <div className="project-tabs">
          <button
            className={tab === "create" ? "active" : ""}
            onClick={() => setTab("create")}
          >
            <Plus size={14} />
            新建家具
          </button>
          <button
            className={tab === "account" ? "active" : ""}
            onClick={() => {
              setTab("account");
              if (loggedIn) void catalog.load();
            }}
          >
            <Cloud size={14} />
            账号家具库
          </button>
        </div>
        {tab === "account" ? (
          <>
            {!loggedIn ? (
              <Button onClick={login}>登录查看账号库</Button>
            ) : (
              <div className="account-furniture-list">
                {catalog.loading && <Loader2 className="animate-spin" />}
                {catalog.error && <p className="form-error">{catalog.error}</p>}
                {catalog.items.map((i) => (
                  <button
                    key={i.catalogId}
                    onClick={() => {
                      onImport(i);
                      onOpenChange(false);
                    }}
                  >
                    {i.imageUrl ? (
                      <img
                        src={i.imageUrl}
                        crossOrigin="anonymous"
                        alt={i.name}
                      />
                    ) : (
                      <Image size={24} />
                    )}
                    <span>
                      {i.name}
                      <small>
                        {i.category} · ¥{i.price ?? "未定价"}
                      </small>
                    </span>
                    <Plus size={14} />
                  </button>
                ))}
                {!catalog.loading && !catalog.items.length && (
                  <p className="muted-note">
                    账号库暂无家具，创建时可勾选同步加入。
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (account && !loggedIn) {
                login();
                return;
              }
              const width = Number(w),
                depth = Number(d),
                height = Number(h),
                amount = price === "" ? null : Number(price);
              if (
                !name.trim() ||
                ![width, depth].every(
                  (n) => Number.isFinite(n) && n >= 50 && n <= 20000,
                ) ||
                !Number.isFinite(height) ||
                height < 50 ||
                height > 8000 ||
                (amount !== null && !validPrice(amount))
              ) {
                setError("请填写名称、有效尺寸及非负单价");
                return;
              }
              const item: LibraryItem = {
                catalogId: uid(),
                name: name.trim(),
                category,
                type,
                w: width,
                d: depth,
                height,
                color,
                price: amount,
                imageUrl: ai.image || undefined,
              };
              onCreate(item);
              if (account) {
                setSaving(true);
                try {
                  await catalog.save(item);
                } catch (err) {
                  setRetry(item);
                  setError(
                    "项目已保存，账号库保存失败：" +
                      (err instanceof Error ? err.message : "请重试"),
                  );
                  setSaving(false);
                  return;
                }
                setSaving(false);
              }
              setName("");
              setError("");
              onOpenChange(false);
            }}
          >
            <div className="custom-furniture-layout">
              <div className="custom-furniture-fields">
                <label>
                  名称
                  <input
                    aria-label="家具名称"
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </label>
                <label>
                  分类
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  参考模型
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                  >
                    {types.map((i) => (
                      <option key={i.type} value={i.type}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="custom-dimensions">
                  <label>
                    宽 mm
                    <input
                      type="number"
                      value={w}
                      onChange={(e) => setW(e.target.value)}
                    />
                  </label>
                  <label>
                    深 mm
                    <input
                      type="number"
                      value={d}
                      onChange={(e) => setD(e.target.value)}
                    />
                  </label>
                  <label>
                    高 mm
                    <input
                      type="number"
                      value={h}
                      onChange={(e) => setH(e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  价格 / 元每件
                  <input
                    type="number"
                    min={0}
                    placeholder="未定价"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </label>
                <label>
                  模型颜色
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                  />
                </label>
              </div>
              <div className="custom-image-panel">
                <div className="custom-image-preview">
                  {ai.image ? (
                    <img
                      src={ai.image}
                      crossOrigin="anonymous"
                      alt="家具生成外观"
                    />
                  ) : ai.busy ? (
                    <>
                      <Loader2 className="animate-spin" />
                      <span>正在生成外观图片…</span>
                    </>
                  ) : (
                    <>
                      <Image size={32} />
                      <span>可选：生成家具外观图</span>
                    </>
                  )}
                </div>
                <textarea
                  aria-label="家具外观描述"
                  placeholder="描述材质、形状和风格，例如：原木框架、米色布艺的双人沙发"
                  maxLength={2000}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={ai.busy || prompt.trim().length < 3}
                  onClick={() => {
                    if (!loggedIn) login();
                    else void ai.generate(prompt);
                  }}
                >
                  <Sparkles />
                  Seedream 5 生成图片
                </Button>
                {ai.error && <p className="form-error">{ai.error}</p>}
                <small>生成可能消耗 AI 额度；不是自动 3D 建模。</small>
              </div>
            </div>
            <label className="account-catalog-option">
              <input
                type="checkbox"
                checked={account}
                onChange={(e) => setAccount(e.target.checked)}
              />
              同时添加到账号家具库
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {retry && (
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  if(!loggedIn){login();return;}
                  try {
                    await catalog.save(retry);
                    setRetry(null);
                    setError("");
                    onOpenChange(false);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "保存失败");
                  }
                }}
              >
                重试账号库保存
              </Button>
            )}
            <div className="visual-form-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                取消
              </Button>
              <Button disabled={ai.busy || saving || !!retry}>
                <Plus />
                保存到项目家具库
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
