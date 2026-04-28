import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Auth from "./pages/Auth.tsx";
import Invite from "./pages/Invite.tsx";

import TrainerOnboarding from "./pages/trainer/Onboarding.tsx";
import TrainerDashboard from "./pages/trainer/Dashboard.tsx";
import TrainerAthletes from "./pages/trainer/AthletesList.tsx";
import TrainerAthleteProfile from "./pages/trainer/AthleteProfile.tsx";
import TrainerProgram from "./pages/trainer/ProgramBuilder.tsx";
import TrainerCalendar from "./pages/trainer/Calendar.tsx";
import TrainerPayment from "./pages/trainer/Payment.tsx";
import TrainerFinances from "./pages/trainer/Finances.tsx";
import TrainerExerciseLibrary from "./pages/trainer/ExerciseLibrary.tsx";
import TrainerProgramTemplates from "./pages/trainer/ProgramTemplates.tsx";
import TrainerProgramBuilderNew from "./pages/trainer/ProgramBuilderNew.tsx";
import TrainerNutritionTemplates from "./pages/trainer/NutritionTemplates.tsx";
import TrainerNutritionBuilder from "./pages/trainer/NutritionBuilder.tsx";

import AthleteOnboarding from "./pages/athlete/Onboarding.tsx";
import AthleteHome from "./pages/athlete/Home.tsx";
import AthleteWorkout from "./pages/athlete/ActiveWorkout.tsx";
import AthleteBooking from "./pages/athlete/Booking.tsx";
import AthleteProgress from "./pages/athlete/Progress.tsx";
import AthleteMembership from "./pages/athlete/Membership.tsx";
import AthleteNutrition from "./pages/athlete/Nutrition.tsx";

const queryClient = new QueryClient();

const trainer = (el: JSX.Element) => <ProtectedRoute requireRole="trainer">{el}</ProtectedRoute>;
const athlete = (el: JSX.Element) => <ProtectedRoute requireRole="athlete">{el}</ProtectedRoute>;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/invite/:code" element={<Invite />} />

            {/* Trener — protected */}
            <Route path="/trener/onboarding" element={trainer(<TrainerOnboarding />)} />
            <Route path="/trener" element={trainer(<TrainerDashboard />)} />
            <Route path="/trener/vezbaci" element={trainer(<TrainerAthletes />)} />
            <Route path="/trener/vezbaci/:id" element={trainer(<TrainerAthleteProfile />)} />
            <Route path="/trener/program" element={trainer(<TrainerProgram />)} />
            <Route path="/trener/kalendar" element={trainer(<TrainerCalendar />)} />
            <Route path="/trener/uplata/:id" element={trainer(<TrainerPayment />)} />
            <Route path="/trener/finansije" element={trainer(<TrainerFinances />)} />
            <Route path="/trener/biblioteka" element={trainer(<TrainerExerciseLibrary />)} />
            <Route path="/trener/programi" element={trainer(<TrainerProgramTemplates />)} />
            <Route path="/trener/programi/:id" element={trainer(<TrainerProgramBuilderNew />)} />
            <Route path="/trener/ishrana" element={trainer(<TrainerNutritionTemplates />)} />
            <Route path="/trener/ishrana/:id" element={trainer(<TrainerNutritionBuilder />)} />

            {/* Vežbač — protected */}
            <Route path="/vezbac/onboarding" element={athlete(<AthleteOnboarding />)} />
            <Route path="/vezbac" element={athlete(<AthleteHome />)} />
            <Route path="/vezbac/trening" element={athlete(<AthleteWorkout />)} />
            <Route path="/vezbac/rezervacija" element={athlete(<AthleteBooking />)} />
            <Route path="/vezbac/napredak" element={athlete(<AthleteProgress />)} />
            <Route path="/vezbac/clanarina" element={athlete(<AthleteMembership />)} />
            <Route path="/vezbac/ishrana" element={athlete(<AthleteNutrition />)} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
