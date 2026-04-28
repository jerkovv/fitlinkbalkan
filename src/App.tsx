import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";

import TrainerOnboarding from "./pages/trainer/Onboarding.tsx";
import TrainerDashboard from "./pages/trainer/Dashboard.tsx";
import TrainerAthletes from "./pages/trainer/AthletesList.tsx";
import TrainerAthleteProfile from "./pages/trainer/AthleteProfile.tsx";
import TrainerProgram from "./pages/trainer/ProgramBuilder.tsx";
import TrainerCalendar from "./pages/trainer/Calendar.tsx";
import TrainerPayment from "./pages/trainer/Payment.tsx";
import TrainerFinances from "./pages/trainer/Finances.tsx";

import AthleteOnboarding from "./pages/athlete/Onboarding.tsx";
import AthleteHome from "./pages/athlete/Home.tsx";
import AthleteWorkout from "./pages/athlete/ActiveWorkout.tsx";
import AthleteBooking from "./pages/athlete/Booking.tsx";
import AthleteProgress from "./pages/athlete/Progress.tsx";
import AthleteMembership from "./pages/athlete/Membership.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />

          {/* Trener */}
          <Route path="/trener/onboarding" element={<TrainerOnboarding />} />
          <Route path="/trener" element={<TrainerDashboard />} />
          <Route path="/trener/vezbaci" element={<TrainerAthletes />} />
          <Route path="/trener/vezbaci/:id" element={<TrainerAthleteProfile />} />
          <Route path="/trener/program" element={<TrainerProgram />} />
          <Route path="/trener/kalendar" element={<TrainerCalendar />} />
          <Route path="/trener/uplata/:id" element={<TrainerPayment />} />
          <Route path="/trener/finansije" element={<TrainerFinances />} />

          {/* Vežbač */}
          <Route path="/vezbac/onboarding" element={<AthleteOnboarding />} />
          <Route path="/vezbac" element={<AthleteHome />} />
          <Route path="/vezbac/trening" element={<AthleteWorkout />} />
          <Route path="/vezbac/rezervacija" element={<AthleteBooking />} />
          <Route path="/vezbac/napredak" element={<AthleteProgress />} />
          <Route path="/vezbac/clanarina" element={<AthleteMembership />} />

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
