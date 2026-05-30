
import { Navigate, Route, Routes } from "react-router-dom";
import Landing from "@/pages/Landing";
import AppShell from "@/pages/AppShell";
import Dashboard from "@/pages/Dashboard";
import { ComingSoonPage } from "@/pages/ComingSoon";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app" element={<AppShell />}>
        <Route index element={<Dashboard />} />
        {/* Week 6+ routes — placeholder for now */}
        <Route path="post" element={<ComingSoonPage title="Post a job" />} />
        <Route path="jobs" element={<ComingSoonPage title="My jobs" />} />
        <Route path="jobs/:id" element={<ComingSoonPage title="Job detail" />} />
        <Route path="marketplace" element={<ComingSoonPage title="Marketplace" />} />
        <Route path="work" element={<ComingSoonPage title="My work" />} />
        <Route path="queue" element={<ComingSoonPage title="Dispute queue" />} />
        <Route path="profile" element={<ComingSoonPage title="Profile" />} />
        <Route path="wallet" element={<ComingSoonPage title="Wallet" />} />
        <Route path="settings" element={<ComingSoonPage title="Settings" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
