/**
 * App routes.
 *
 *   /                       → Landing (public)
 *   /app/*                  → AppShell layout, with:
 *     /app                  → Dashboard
 *     /app/marketplace      → Marketplace
 *     /app/post             → PostJob
 *     /app/jobs             → MyJobs (dual client/builder tabs)
 *     /app/jobs/:id         → JobDetail
 *     /app/profile          → MyProfile
 *     /app/profiles/:address→ PublicProfile
 *     /app/wallet           → Wallet
 *     /app/settings         → Settings
 *     /app/queue            → placeholder (arbitrator dispute queue, earlier+)
 *   *                       → redirect to /
 */

import { Navigate, Route, Routes } from "react-router-dom";
import Landing from "@/pages/Landing";
import AppShell from "@/pages/AppShell";
import Dashboard from "@/pages/Dashboard";
import Marketplace from "@/pages/Marketplace";
import PostJob from "@/pages/PostJob";
import JobDetail from "@/pages/JobDetail";
import MyProfile from "@/pages/MyProfile";
import PublicProfile from "@/pages/PublicProfile";
import MyJobs from "@/pages/MyJobs";
import Wallet from "@/pages/Wallet";
import Settings from "@/pages/Settings";
import DisputeQueue from "@/pages/DisputeQueue";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app" element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="marketplace" element={<Marketplace />} />
        <Route path="post" element={<PostJob />} />
        <Route path="jobs" element={<MyJobs />} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="work" element={<MyJobs />} />
        <Route path="profile" element={<MyProfile />} />
        <Route path="profiles/:address" element={<PublicProfile />} />
        <Route path="wallet" element={<Wallet />} />
        <Route path="settings" element={<Settings />} />
        <Route path="queue" element={<DisputeQueue />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}