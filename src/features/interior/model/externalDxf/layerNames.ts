/**
 * 常见 CAD 图层名的中文说明。图层名是图纸里的原始数据不能改，界面上用中文名展示、原名作为辅助信息。
 * 按顺序匹配，靠前的规则更具体。
 */
const LAYER_NAMES: [RegExp, string][] = [
  [/^0$/, '默认图层'],
  [/^defpoints$/i, '定义点'],
  [/demo|拆/i, '拆除墙体'],
  [/separat|bndy|分隔|分割/i, '房间分隔线'],
  [/iden|room.?label|room.?name|房间.?名/i, '房间名称'],
  [/patt|hatch|填充/i, '填充'],
  [/open|门窗|洞/i, '门窗'],
  [/door|门/i, '门'],
  [/win|glaz|窗/i, '窗'],
  [/wall|墙|^qt|[-_]qt/i, '墙体'],
  [/col|柱/i, '柱子'],
  [/stair|strs|楼梯/i, '楼梯'],
  [/furn|家具/i, '家具'],
  [/dim|标注|尺寸/i, '尺寸标注'],
  [/axis|轴/i, '轴线'],
  [/hatch|填充/i, '填充'],
  [/text|文字/i, '文字'],
  [/room|area|房间/i, '房间'],
];

/** 图层的中文名；认不出的返回空字符串，界面上只显示原名。 */
export const layerLabel = (name: string) => LAYER_NAMES.find(([pattern]) => pattern.test(name))?.[1] ?? '';
