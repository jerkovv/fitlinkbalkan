import { Outlet } from "react-router-dom";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { TrainerWebShell } from "./TrainerWebShell";

// Parent route nad <TrainerLayout/> (koji ostaje potpuno nedirnut - isti
// soft-lock kao u appu). Jedini posao ovog sloja je hromiranje: na
// fitlink.rs/dashboard (širok ekran) oblaci Outlet u sidebar+topbar; svuda
// drugde (app.fitlink.rs native i web, uzak fitlink.rs/dashboard) je no-op.
export const TrainerDesktopChrome = () => {
  const desktop = useDesktopWeb();
  if (!desktop) return <Outlet />;
  return (
    <TrainerWebShell>
      <Outlet />
    </TrainerWebShell>
  );
};

export default TrainerDesktopChrome;
