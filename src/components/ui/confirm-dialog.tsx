import * as React from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface ConfirmOptions {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  tone?: "default" | "destructive"
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = React.createContext<Confirm | null>(null)

export function ConfirmDialogProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [request, setRequest] = React.useState<ConfirmOptions | null>(null)
  const resolver = React.useRef<((value: boolean) => void) | null>(null)

  const settle = React.useCallback((value: boolean) => {
    const resolve = resolver.current
    resolver.current = null
    setRequest(null)
    resolve?.(value)
  }, [])

  const confirm = React.useCallback<Confirm>((options) => {
    resolver.current?.(false)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
      setRequest(options)
    })
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={!!request}
        onOpenChange={(open) => {
          if (!open) settle(false)
        }}
      >
        <AlertDialogContent className="confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{request?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {request?.description ?? ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {request?.cancelText ?? "取消"}
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                request?.tone === "destructive" &&
                  buttonVariants({ variant: "destructive" }),
              )}
              onClick={() => settle(true)}
            >
              {request?.confirmText ?? "确定"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm() {
  const confirm = React.useContext(ConfirmContext)
  if (!confirm) throw new Error("useConfirm 必须在 ConfirmDialogProvider 内使用")
  return confirm
}
