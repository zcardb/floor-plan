import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { routers } from "./router";

const queryClient = new QueryClient();
const router = createBrowserRouter(routers);

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ConfirmDialogProvider>
          <RouterProvider router={router} />
        </ConfirmDialogProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
