/**
 * App routes.
 *
 *   /                       → Landing (public)
 *   /app/*                  → AppShell layout, with:
 *     /app                  → Dashboard
 *     /app/marketplace      → Marketplace
 *     /app/post             → PostJob (form only this week)
 *     /app/jobs/:id         → JobDetail
 *     /app/profile          → MyProfile (own profile + edit)
 *     /app/profiles/:address→ PublicProfile (someone else's)
 *     other                 → placeholder
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
import { ComingSoonPage } from "@/pages/ComingSoon";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app" element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="marketplace" element={<Marketplace />} />
        <Route path="post" element={<PostJob />} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="profile" element={<MyProfile />} />
        <Route path="profiles/:address" element={<PublicProfile />} />
        {/* Still-deferred — ship in Week 7+ */}
        <Route path="jobs" element={<ComingSoonPage title="My jobs" />} />
        <Route path="work" element={<ComingSoonPage title="My work" />} />
        <Route path="queue" element={<ComingSoonPage title="Dispute queue" />} />
        <Route path="wallet" element={<ComingSoonPage title="Wallet" />} />
        <Route path="settings" element={<ComingSoonPage title="Settings" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
