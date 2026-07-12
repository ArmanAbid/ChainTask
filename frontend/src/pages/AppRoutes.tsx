/**
 * AppRoutes — the main router for /app/*.
 *
 * All routes wrapped in <AppShell> which renders the sidebar + topbar.
 * Post-W10: Wallet, Settings, and My Jobs are wired to real pages.
 */

import { Route, Routes } from "react-router-dom";
import AppShell from "./AppShell";
import Dashboard from "./Dashboard";
import Marketplace from "./Marketplace";
import PostJob from "./PostJob";
import JobDetail from "./JobDetail";
import MyProfile from "./MyProfile";
import PublicProfile from "./PublicProfile";
import MyJobs from "./MyJobs";
import Wallet from "./Wallet";
import Settings from "./Settings";

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="marketplace" element={<Marketplace />} />
        <Route path="post" element={<PostJob />} />
        <Route path="jobs" element={<MyJobs />} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="profile" element={<MyProfile />} />
        <Route path="profiles/:address" element={<PublicProfile />} />
        <Route path="wallet" element={<Wallet />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}