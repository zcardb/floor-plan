import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { blankDesign, referenceDesign } from '../data/templates';
import { REPORT_CONTENTS, REPORT_NOTES, REPORT_SECTIONS, buildReport } from '../model/report';
import { ReportView } from './ReportView';

const DATE = new Date(2026, 9, 12);
const html = (model: ReturnType<typeof buildReport>, planSrc: string | null) => renderToStaticMarkup(createElement(ReportView, { model, planSrc }));

describe('方案报告预览', () => {
  it('顺序与 PDF 一致：平面图与关键信息在最前，然后是目录、预算构成、关键数字与三张清单', () => {
    const markup = html(buildReport(referenceDesign(), undefined, { name: '原木之家', date: DATE }), 'data:image/svg+xml,plan');
    const at = (text: string) => { const index = markup.indexOf(text); expect(index, text).toBeGreaterThanOrEqual(0); return index; };
    const order = [
      at('<img src="data:image/svg+xml,plan"'),
      at('aria-label="目录"'),
      at(`id="report-budget"`),
      at(`id="report-figures"`),
      at(`id="report-rooms"`),
      at(`id="report-layout"`),
      at(`id="report-furniture"`),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // 首屏：项目名、日期与信息带在平面图之前
    expect(at('原木之家')).toBeLessThan(order[0]!);
    expect(at('2026-10-12 · 方案报告')).toBeLessThan(order[0]!);
    expect(at('预算总价')).toBeLessThan(order[0]!);
  });

  it('目录的每一项都能跳到对应章节', () => {
    const markup = html(buildReport(referenceDesign(), undefined, { name: '原木之家', date: DATE }), null);
    for (const [section, title] of REPORT_CONTENTS) {
      expect(markup).toContain(`<a href="#report-${section}">${title}</a>`);
      expect(markup).toContain(`id="report-${section}"`);
    }
    expect(markup).toContain(REPORT_SECTIONS.furniture);
  });

  it('没有墙体时首屏写「暂无平面图」，没有家具时清单给出说明', () => {
    const empty = { ...blankDesign(), walls: [], rooms: [], openings: [], furniture: [] };
    const markup = html(buildReport(empty, undefined, { date: DATE }), null);
    expect(markup).toContain(REPORT_NOTES.noPlan);
    expect(markup).toContain(REPORT_NOTES.noFurniture);
    expect(markup).not.toContain('<img');
  });
});
