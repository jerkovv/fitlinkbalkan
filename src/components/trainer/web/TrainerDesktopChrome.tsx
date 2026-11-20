import { Outlet } from "react-router-dom";
import { isDashboardHost, useDesktopWeb } from "@/hooks/useDesktopWeb";
import { OtvoriAplikaciju } from "@/components/OtvoriAplikaciju";
import { TrainerWebShell } from "./TrainerWebShell";

// Parent route nad <TrainerLayout/> (koji ostaje potpuno nedirnut - isti
// soft-lock kao u appu). Jedini posao ovog sloja je hromiranje: na
// fitlink.rs/dashboard (širok ekran) oblaci Outlet u sidebar+topbar. Uzak
// fitlink.rs/dashboard vise ne pokazuje stari svetli izgled za telefon nego
// salje na aplikaciju. app.fitlink.rs (native i web) je i dalje no-op.
export const TrainerDesktopChrome = () => {
  const desktop = useDesktopWeb();
  if (!desktop) return isDashboardHost() ? <OtvoriAplikaciju /> : <Outlet />;
  return (
    <TrainerWebShell>
      <Outlet />
    </TrainerWebShell>
  );
};

export default TrainerDesktopChrome;
