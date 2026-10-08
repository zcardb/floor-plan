import { CircleCheck, CircleX, Info, Loader2, TriangleAlert } from "lucide-react"
import { Toaster as Sonner, toast } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

/** 全站唯一提示出口：顶部居中，成功 / 失败 / 报错 / 信息按语义色区分。 */
const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme="light"
    position="top-center"
    offset={64}
    gap={8}
    className="toaster group"
    icons={{
      success: <CircleCheck className="h-[18px] w-[18px] text-success" />,
      error: <CircleX className="h-[18px] w-[18px] text-destructive" />,
      warning: <TriangleAlert className="h-[18px] w-[18px] text-warning" />,
      info: <Info className="h-[18px] w-[18px] text-muted-foreground" />,
      loading: <Loader2 className="h-[18px] w-[18px] animate-spin text-muted-foreground" />,
    }}
    toastOptions={{
      classNames: {
        toast:
          "group toast group-[.toaster]:items-start group-[.toaster]:gap-2.5 group-[.toaster]:rounded-lg group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:bg-toast-surface group-[.toaster]:px-4 group-[.toaster]:py-3 group-[.toaster]:text-popover-foreground group-[.toaster]:shadow-lg",
        title: "text-[13px] font-semibold leading-5",
        description:
          "group-[.toast]:mt-0.5 group-[.toast]:break-words group-[.toast]:font-mono group-[.toast]:text-xs group-[.toast]:leading-[18px] group-[.toast]:text-muted-foreground",
        icon: "group-[.toast]:mt-px",
        success: "group-[.toaster]:border-success/30 group-[.toaster]:bg-toast-surface",
        error: "group-[.toaster]:border-destructive/30 group-[.toaster]:bg-toast-surface",
        warning: "group-[.toaster]:border-warning/30 group-[.toaster]:bg-toast-surface",
        info: "group-[.toaster]:border-border",
        actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
        cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
      },
    }}
    {...props}
    closeButton={false}
  />
)

// eslint-disable-next-line react-refresh/only-export-components
export { Toaster, toast }
