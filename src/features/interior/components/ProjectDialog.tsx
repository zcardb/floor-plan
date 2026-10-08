import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  FolderOpen,
  Plus,
  Copy,
  Pencil,
  Trash2,
  Cloud,
  HardDrive,
  ArrowUpRight,
  SquareDashed,
  LayoutTemplate,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { createProject } from "../data/templates";
import type { Project } from "../model/types";
import type { ProjectSummary } from "../cloud/useProjects";
interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  guests: Project[];
  cloud: ProjectSummary[];
  active: Project | null;
  loggedIn: boolean;
  loading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
  onOpen: (p: ProjectSummary) => Promise<boolean>;
  onCreate: (p: Project, toCloud: boolean) => Promise<boolean>;
  onRemove: (p: ProjectSummary) => Promise<void>;
  onRename: (p: ProjectSummary, name: string) => Promise<void>;
  onDuplicate: (p: ProjectSummary) => Promise<void>;
  login: () => void;
}
export function ProjectDialog(p: Props) {
  const [tab, setTab] = useState("local"),
    [creating, setCreating] = useState(false),
    [template, setTemplate] = useState<"blank" | "reference">("blank"),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [rename, setRename] = useState<ProjectSummary | null>(null),
    [renameText, setRenameText] = useState("");
  const list = tab === "local" ? p.guests : p.cloud;
  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="projects-dialog">
        <DialogHeader>
          <DialogTitle>
            <FolderOpen size={21} />
            我的设计项目
          </DialogTitle>
          <DialogDescription>
            从一个空白空间开始，或继续你的灵感。
          </DialogDescription>
        </DialogHeader>
        <div className="project-controls">
          <div className="project-tabs">
            <button
              className={tab === "local" ? "active" : ""}
              onClick={() => setTab("local")}
            >
              <HardDrive size={15} />
              本机项目
            </button>
            <button
              className={tab === "cloud" ? "active" : ""}
              onClick={() => {
                setTab("cloud");
                if (p.loggedIn) p.reload();
              }}
            >
              <Cloud size={15} />
              云端项目
            </button>
          </div>
          <Button size="sm" onClick={() => setCreating(!creating)}>
            <Plus />
            新建项目
          </Button>
        </div>
        {creating && (
          <form
            className="create-project"
            onSubmit={async (e) => {
              e.preventDefault();
              if (tab === "cloud" && !p.loggedIn) {
                p.login();
                return;
              }
              setBusy(true);
              const ok = await p.onCreate(
                createProject(template, name.trim() || undefined),
                tab === "cloud",
              );
              setBusy(false);
              if (ok) {
                setCreating(false);
                p.onOpenChange(false);
              }
            }}
          >
            <div className="template-options">
              <button
                type="button"
                className={template === "blank" ? "active" : ""}
                onClick={() => setTemplate("blank")}
              >
                <SquareDashed size={31} />
                <b>空白户型</b>
                <small>四周墙体 · 自由规划</small>
              </button>
              <button
                type="button"
                className={template === "reference" ? "active" : ""}
                onClick={() => setTemplate("reference")}
              >
                <LayoutTemplate size={31} />
                <b>参考户型</b>
                <small>三室两厅两卫 · 完整布置</small>
              </button>
            </div>
            <div className="project-name-entry">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder="给设计起个名字（可稍后修改）"
              />
              <Button size="sm" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Plus />}创建
              </Button>
            </div>
          </form>
        )}
        {tab === "cloud" && !p.loggedIn ? (
          <div className="project-empty">
            <Cloud size={35} />
            <h3>让你的设计在云端安家</h3>
            <p>本机项目与下载无需登录。登录后，可将当前设计另存到云端。</p>
            <Button onClick={p.login}>
              登录 / 注册
              <ArrowUpRight />
            </Button>
          </div>
        ) : (
          <>
            <div className="project-list">
              {p.loading && (
                <div className="project-loading">
                  <Loader2 className="animate-spin" size={18} />
                  正在读取云端项目…
                </div>
              )}
              {!p.loading && !list.length && (
                <div className="project-empty">
                  <FolderOpen size={32} />
                  <h3>还没有项目</h3>
                  <p>新建空白户型，开始规划你的空间。</p>
                </div>
              )}
              {list.map((row) => (
                <div
                  key={row.id}
                  className={
                    "project-row " + (row.id === p.active?.id ? "current" : "")
                  }
                >
                  <button
                    className="project-open"
                    onClick={async () => {
                      if (await p.onOpen(row)) p.onOpenChange(false);
                    }}
                  >
                    <span className="project-thumbnail">
                      <LayoutTemplate size={27} />
                    </span>
                    <span>
                      <b>{row.name}</b>
                      <small>
                        {new Date(row.updatedAt).toLocaleDateString("zh-CN")} ·{" "}
                        {row.cloud ? "云端项目" : "本机项目"}
                        {row.id === p.active?.id ? " · 当前" : ""}
                      </small>
                    </span>
                  </button>
                  <div className="project-row-actions">
                    <button
                      title="重命名"
                      onClick={() => {
                        setRename(row);
                        setRenameText(row.name);
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      title="复制项目"
                      onClick={() => void p.onDuplicate(row)}
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      title="删除项目"
                      onClick={() => void p.onRemove(row)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {tab === "cloud" && (
              <div className="project-list-footer">
                <button onClick={p.reload}>
                  <RefreshCw size={13} />
                  刷新
                </button>
                {p.hasMore && <button onClick={p.loadMore}>加载更多</button>}
              </div>
            )}
          </>
        )}
        {rename && (
          <form
            className="rename-inline"
            onSubmit={async (e) => {
              e.preventDefault();
              await p.onRename(rename, renameText);
              setRename(null);
            }}
          >
            <input
              autoFocus
              value={renameText}
              onChange={(e) => setRenameText(e.target.value)}
              maxLength={100}
              required
            />
            <Button size="sm">保存名称</Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => setRename(null)}
            >
              取消
            </Button>
          </form>
        )}
        <p className="project-footnote">
          <HardDrive size={13} />
          本机项目仅保存在当前浏览器，请下载 JSON 备份重要设计。
        </p>
      </DialogContent>
    </Dialog>
  );
}
