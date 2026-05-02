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
import ResetPassword from "./pages/ResetPassword.tsx";
import TrainerPublic from "./pages/TrainerPublic.tsx";

import TrainerOnboarding from "./pages/trainer/Onboarding.tsx";
import TrainerDashboard from "./pages/trainer/Dashboard.tsx";
import TrainerAthletes from "./pages/trainer/AthletesList.tsx";
import TrainerAthleteProfile from "./pages/trainer/AthleteProfile.tsx";
import TrainerProgram from "./pages/trainer/ProgramBuilder.tsx";
import TrainerCalendar from "./pages/trainer/Calendar.tsx";
import TrainerSessionSettings from "./pages/trainer/SessionSettings.tsx";
import TrainerPayment from "./pages/trainer/Payment.tsx";
import TrainerFinances from "./pages/trainer/Finances.tsx";
import TrainerExerciseLibrary from "./pages/trainer/ExerciseLibrary.tsx";
import TrainerProgramTemplates from "./pages/trainer/ProgramTemplates.tsx";
import TrainerProgramBuilderNew from "./pages/trainer/ProgramBuilderNew.tsx";
import TrainerNutritionTemplates from "./pages/trainer/NutritionTemplates.tsx";
import TrainerNutritionBuilder from "./pages/trainer/NutritionBuilder.tsx";
import TrainerNotifications from "./pages/trainer/Notifications.tsx";
import TrainerNotificationSettings from "./pages/trainer/NotificationSettings.tsx";
import TrainerProfile from "./pages/trainer/Profile.tsx";
import TrainerPackages from "./pages/trainer/Packages.tsx";
import TrainerPayments from "./pages/trainer/Payments.tsx";
import TrainerChatList from "./pages/trainer/ChatList.tsx";
import TrainerChatThread from "./pages/trainer/ChatThread.tsx";
import TrainerLiveWorkout from "./pages/trainer/LiveWorkoutView.tsx";


import AthleteHome from "./pages/athlete/Home.tsx";
import AthleteWorkout from "./pages/athlete/ActiveWorkout.tsx";
import AthleteWorkoutSummary from "./pages/athlete/WorkoutSummary.tsx";
import AthleteWorkoutHome from "./pages/athlete/WorkoutHome.tsx";
import AthleteBooking from "./pages/athlete/Booking.tsx";
import AthleteProgress from "./pages/athlete/Progress.tsx";
import AthleteMembership from "./pages/athlete/Membership.tsx";
import AthleteNutrition from "./pages/athlete/Nutrition.tsx";
import AthleteNotifications from "./pages/athlete/Notifications.tsx";
import AthleteProfile from "./pages/athlete/Profile.tsx";
import AthleteChat from "./pages/athlete/Chat.tsx";
import AthleteIntegracije from "./pages/athlete/Integracije.tsx";
import AthleteTreninzi from "./pages/athlete/Treninzi.tsx";

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
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/t/:slug" element={<TrainerPublic />} />

            {/* Trener — protected */}
            <Route path="/trener/onboarding" element={trainer(<TrainerOnboarding />)} />
            <Route path="/trener" element={trainer(<TrainerDashboard />)} />
            <Route path="/trener/vezbaci" element={trainer(<TrainerAthletes />)} />
            <Route path="/trener/vezbaci/:id" element={trainer(<TrainerAthleteProfile />)} />
            <Route path="/trener/program" element={trainer(<TrainerProgram />)} />
            <Route path="/trener/kalendar" element={trainer(<TrainerCalendar />)} />
            <Route path="/trener/termini" element={trainer(<TrainerSessionSettings />)} />
            <Route path="/trener/uplata/:id" element={trainer(<TrainerPayment />)} />
            <Route path="/trener/finansije" element={trainer(<TrainerFinances />)} />
            <Route path="/trener/biblioteka" element={trainer(<TrainerExerciseLibrary />)} />
            <Route path="/trener/programi" element={trainer(<TrainerProgramTemplates />)} />
            <Route path="/trener/programi/:id" element={trainer(<TrainerProgramBuilderNew />)} />
            <Route path="/trener/ishrana" element={trainer(<TrainerNutritionTemplates />)} />
            <Route path="/trener/ishrana/:id" element={trainer(<TrainerNutritionBuilder />)} />
            <Route path="/trener/notifikacije" element={trainer(<TrainerNotifications />)} />
            <Route path="/trener/podesavanja-obavestenja" element={trainer(<TrainerNotificationSettings />)} />
            <Route path="/trener/profil" element={trainer(<TrainerProfile />)} />
            <Route path="/trener/paketi" element={trainer(<TrainerPackages />)} />
            <Route path="/trener/uplate" element={trainer(<TrainerPayments />)} />
            <Route path="/trener/chat" element={trainer(<TrainerChatList />)} />
            <Route path="/trener/chat/:athleteId" element={trainer(<TrainerChatThread />)} />
            <Route path="/trener/vezbac/:athleteId/live" element={trainer(<TrainerLiveWorkout />)} />

            {/* Vežbač — protected */}
            <Route path="/vezbac" element={athlete(<AthleteHome />)} />
            <Route path="/vezbac/trening" element={athlete(<AthleteWorkoutHome />)} />
            <Route path="/vezbac/trening/aktivan/:dayId" element={athlete(<AthleteWorkout />)} />
            <Route path="/vezbac/trening/zavrsen/:sessionId" element={athlete(<AthleteWorkoutSummary />)} />
            <Route path="/vezbac/trening/:dayId" element={athlete(<AthleteWorkout />)} />
            <Route path="/vezbac/rezervacija" element={athlete(<AthleteBooking />)} />
            <Route path="/vezbac/napredak" element={athlete(<AthleteProgress />)} />
            <Route path="/vezbac/clanarina" element={athlete(<AthleteMembership />)} />
            <Route path="/vezbac/ishrana" element={athlete(<AthleteNutrition />)} />
            <Route path="/vezbac/notifikacije" element={athlete(<AthleteNotifications />)} />
            <Route path="/vezbac/profil" element={athlete(<AthleteProfile />)} />
            <Route path="/vezbac/chat" element={athlete(<AthleteChat />)} />
            <Route path="/vezbac/integracije" element={athlete(<AthleteIntegracije />)} />
            <Route path="/vezbac/treninzi" element={athlete(<AthleteTreninzi />)} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
