import { FileDown, Loader2 } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { yuan } from "@/lib/floor-plan/money";
import {
  REPORT_CONTENTS,
  REPORT_CONTENTS_TITLE,
  REPORT_NOTES,
  REPORT_SECTIONS,
  figureCards,
  formatArea,
  formatShare,
  infoItems,
  layoutPassNote,
  unpricedNote,
  type ReportModel,
  type ReportSection,
} from "../model/report";
import { serializeSvg } from "@/lib/drawing/svg-export";

const sectionId = (section: ReportSection) => `report-${section}`;
const price = (value: number | null) => (value === null ? "未定价" : yuan(value));

/**
 * 报告正文：顺序与 PDF 一致——平面图与关键信息、目录、预算构成、关键数字、逐间清单、布局体检、家具清单。
 * 纯展示，平面图图片由调用方生成后传入（没有墙体时为 null）。目录项可点，跳到对应章节。
 */
export function ReportView({ model, planSrc }: { model: ReportModel; planSrc: string | null }) {
  const { info, figures, budget, rooms, layout, furniture } = model;
  return (
    <article className="report-view">
      <section id={sectionId("plan")} className="report-cover" aria-label={`${REPORT_SECTIONS.plan}与${REPORT_SECTIONS.info}`}>
        <header className="report-cover-head">
          <h2>{info.name}</h2>
          <span>{info.date} · 方案报告</span>
        </header>
        <dl className="report-info-band">
          {infoItems(model).map(([label, value, note]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}{note && <small>{note}</small>}</dd>
            </div>
          ))}
        </dl>
        <figure className="report-plan">
          {planSrc ? <img src={planSrc} alt={`${info.name}平面图`} /> : <p className="report-empty">{REPORT_NOTES.noPlan}</p>}
        </figure>
      </section>

      <nav className="report-section report-contents" aria-label={REPORT_CONTENTS_TITLE}>
        <h3>{REPORT_CONTENTS_TITLE}</h3>
        <ol>
          {REPORT_CONTENTS.map(([section, title]) => (
            <li key={section}><a href={"#" + sectionId(section)}>{title}</a></li>
          ))}
        </ol>
      </nav>

      <section id={sectionId("budget")} className="report-section">
        <h3>{REPORT_SECTIONS.budget}<small>合计 {yuan(budget.total)}</small></h3>
        <table className="report-table">
          <thead><tr><th>科目</th><th>口径说明</th><th>类别</th><th className="num">金额</th><th className="num">占比</th></tr></thead>
          <tbody>
            {budget.lines.map((line) => (
              <tr key={line.id}>
                <td>{line.label}</td>
                <td className="muted">{line.basis}{line.unpriced > 0 && <em>；{line.unpriced} 项未定价，未计入</em>}</td>
                <td>{line.kind === "soft" ? "软装" : "硬装"}</td>
                <td className="num">{yuan(line.amount)}</td>
                <td className="num">{formatShare(line.share)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={3}>合计</td><td className="num">{yuan(budget.total)}</td><td className="num">{formatShare(budget.total > 0 ? 1 : 0)}</td></tr></tfoot>
        </table>
        <p className="report-note">{REPORT_NOTES.basis}</p>
      </section>

      <section id={sectionId("figures")} className="report-section">
        <h3>{REPORT_SECTIONS.figures}</h3>
        <div className="report-figures">
          {figureCards(figures).map(([label, value, unit], i) => (
            <div key={label} className={i === 0 ? "is-main" : undefined}>
              <span>{label}</span>
              <b>{value}{unit && <small>{unit}</small>}</b>
            </div>
          ))}
        </div>
        {figures.unpriced > 0 && <p className="report-note is-warning">{unpricedNote(figures.unpriced)}</p>}
        <p className="report-note">{REPORT_NOTES.areas}</p>
      </section>

      <section id={sectionId("rooms")} className="report-section">
        <h3>{REPORT_SECTIONS.rooms}<small>{rooms.lines.length} 间 · 套内净面积 {formatArea(info.netArea)}</small></h3>
        <table className="report-table">
          <thead><tr><th>房间</th><th className="num">面积</th><th className="num">硬装</th><th className="num">软装</th><th className="num">合计</th></tr></thead>
          <tbody>
            {rooms.lines.map((line) => (
              <tr key={line.id}>
                <td>{line.name}{!line.counted && " *"}</td>
                <td className="num">{formatArea(line.area)}</td>
                <td className="num">{yuan(line.hard)}</td>
                <td className="num">{yuan(line.soft)}</td>
                <td className="num">{yuan(line.total)}</td>
              </tr>
            ))}
            <tr className="is-shared">
              <td>公共项</td><td className="num">—</td>
              <td className="num">{yuan(rooms.shared.hard)}</td><td className="num">{yuan(rooms.shared.soft)}</td><td className="num">{yuan(rooms.shared.total)}</td>
            </tr>
          </tbody>
        </table>
        <p className="report-note">{REPORT_NOTES.shared}{rooms.lines.some((l) => !l.counted) && " " + REPORT_NOTES.uncounted}</p>
      </section>

      <section id={sectionId("layout")} className="report-section">
        <h3>{REPORT_SECTIONS.layout}<small>{layout.issues.length ? `${layout.issues.length} 处问题` : "通过"}</small></h3>
        {layout.issues.length ? (
          <table className="report-table">
            <thead><tr><th>房间</th><th>家具</th><th>问题</th></tr></thead>
            <tbody>
              {layout.issues.map((issue) => (
                <tr key={issue.furnitureId + issue.kind}><td>{issue.room}</td><td>{issue.furniture}</td><td className="is-warning">{issue.problem}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <p className="report-note">{layoutPassNote(layout.checked)}</p>}
      </section>

      <section id={sectionId("furniture")} className="report-section">
        <h3>{REPORT_SECTIONS.furniture}<small>{furniture.quantity} 件 · {yuan(furniture.total)}</small></h3>
        {furniture.lines.length ? (
          <table className="report-table">
            <thead><tr><th>名称</th><th>型号</th><th className="num">数量</th><th className="num">单价</th><th className="num">小计</th></tr></thead>
            <tbody>
              {furniture.lines.map((line, i) => (
                <tr key={i}>
                  <td>{line.name}{line.hard && <small>（硬装）</small>}</td>
                  <td className="muted">{line.model}</td>
                  <td className="num">{line.quantity}</td>
                  <td className={"num" + (line.price === null ? " is-warning" : "")}>{price(line.price)}</td>
                  <td className="num">{yuan(line.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="report-note">{REPORT_NOTES.noFurniture}</p>}
      </section>
    </article>
  );
}

/**
 * 方案报告预览弹窗：先看报告长什么样，点「下载 PDF」才生成文件（内容与预览同一份数据）。
 * 窄屏下全屏显示，正文滚动，底部按钮常驻。
 */
export function ReportDialog({ open, onOpenChange, model, onExport, exporting = false }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: ReportModel;
  onExport: () => void;
  exporting?: boolean;
}) {
  const planSrc = useMemo(
    () => (model.plan ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(serializeSvg(model.plan, { title: model.info.name })) : null),
    [model.plan, model.info.name],
  );
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!exporting) onOpenChange(next); }}>
      <DialogContent className="report-dialog">
        <DialogHeader className="report-dialog-head">
          <DialogTitle>方案报告预览</DialogTitle>
          <DialogDescription>下载的 PDF 与预览内容一致：首页平面图与关键信息，第 2 页目录与预算，之后是各项清单。</DialogDescription>
        </DialogHeader>
        <div className="report-dialog-body">
          <ReportView model={model} planSrc={planSrc} />
        </div>
        <DialogFooter className="report-dialog-foot">
          <Button type="button" variant="outline" disabled={exporting} onClick={() => onOpenChange(false)}>关闭</Button>
          <Button type="button" disabled={exporting} onClick={onExport}>
            {exporting ? <Loader2 className="animate-spin" /> : <FileDown />}
            {exporting ? "正在生成…" : "下载 PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
