import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** 小助手 Prompt 的 Markdown 预览。单独成模块，由 AssistantDialog 按需加载，Markdown 解析库不进首屏包。 */
export default function AssistantMarkdown({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>;
}
