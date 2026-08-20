import { ReactNode } from "react";
import { TrainerWebSidebar } from "./TrainerWebSidebar";
import { ChatBell } from "@/components/ChatBell";
import { NotificationBell } from "@/components/NotificationBell";
import { UserMenu } from "@/components/UserMenu";

// Desktop hromiranje oko istih ruta/stranica koje koristi i app - ništa se ne
// duplira. Montira se SAMO kad je isDashboardHost() (fitlink.rs/dashboard,
// vidi useDesktopWeb) - app.fitlink.rs ovo nikad ne renderuje.
export const TrainerWebShell = ({ children }: { children: ReactNode }) => {
  return (
    <div className="flex min-h-screen bg-background">
      <TrainerWebSidebar />
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-end gap-2 h-16 px-8 border-b border-hairline bg-background/85 backdrop-blur-xl">
          <ChatBell />
          <NotificationBell />
          <UserMenu />
        </header>
        <main className="px-8 py-8">{children}</main>
      </div>
    </div>
  );
};

export default TrainerWebShell;
