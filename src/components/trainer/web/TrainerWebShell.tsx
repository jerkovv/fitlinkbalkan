import { Outlet } from "react-router-dom";
import { TrainerWebSidebar } from "./TrainerWebSidebar";
import { ChatBell } from "@/components/ChatBell";
import { NotificationBell } from "@/components/NotificationBell";
import { UserMenu } from "@/components/UserMenu";

// Desktop dashboard za trenera (app.fitlink.rs u pregledaču, širok ekran).
// Sidebar + topbar oko iste rute/stranice koje koristi i app - ništa se ne
// duplira, PhoneShell/BottomNav se sami prilagode preko useDesktopWeb().
export const TrainerWebShell = () => {
  return (
    <div className="flex min-h-screen bg-background">
      <TrainerWebSidebar />
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-end gap-2 h-16 px-8 border-b border-hairline bg-background/85 backdrop-blur-xl">
          <ChatBell />
          <NotificationBell />
          <UserMenu />
        </header>
        <main className="px-8 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default TrainerWebShell;
