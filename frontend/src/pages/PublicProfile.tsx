/**
 * PublicProfile — view someone else's builder/client profile.
 *
 * Shows:
 *   - Self-attested identity (name, bio, avatar) — if they've set a profile
 *   - Reputation stats (completed jobs, volume, dispute record) — if they've
 *     completed at least one job
 *   - Active jobs (jobs where they're currently selected as builder)
 *   - Recent job CIDs (from rep datum)
 *
 * Always shows the verified address as the source of truth, with the
 * display name shown as flavor. This makes self-attestation explicit.
 */

import { Link, useParams } from "react-router-dom";
import {
  useBuilderJobs,
  useClientJobs,
  useProfile,
  useReputation,
} from "@/hooks/useQueries";
import { Avatar, Cid, Pill } from "@/components/atoms";
import { EmptyState } from "@/components/EmptyState";
import { Icons } from "@/components/Icons";
import { formatAda, formatRelative, truncateAddress } from "@/lib/format";
import { gatewayUrl } from "@/lib/ipfs";

export default function PublicProfile() {
  const { address } = useParams<{ address: string }>();

  if (!address) {
    return (
      <div className="max-w-[720px] mx-auto px-8 py-12">
        <EmptyState
          icon={<Icons.user className="w-5 h-5" />}
          title="No address"
          description="A wallet address is required to view a profile."
        />
      </div>
    );
  }

  return <PublicProfileContent address={address} />;
}

function PublicProfileContent({ address }: { address: string }) {
  const { data: profile, isLoading: profileLoading } = useProfile(address);
  const { data: rep, isLoading: repLoading } = useReputation(address);
  const { data: builderJobs = [] } = useBuilderJobs(address);
  const { data: clientJobs = [] } = useClientJobs(address);

  const activeBuilderJobs = builderJobs.filter(
    (j) => j.status === "Selected" || j.status === "Submitted",
  );
  const activeClientJobs = clientJobs.filter(
    (j) => j.status === "Open" || j.status === "Selected" || j.status === "Submitted",
  );

  const name = profile?.content?.displayName?.trim();
  const avatarSrc = profile?.content?.avatarCid
    ? gatewayUrl(profile.content.avatarCid)
    : undefined;

  return (
    <div className="max-w-[1180px] mx-auto px-8 py-8 pb-20">
      {/* Header card */}
      <div className="card p-8 mb-6">
        <div className="flex items-start gap-6">
          <Avatar name={name || address} src={avatarSrc} size="xl" />
          <div className="flex-1 min-w-0">
            {profileLoading ? (
              <div className="text-[13px] text-text-faint">Loading profile…</div>
            ) : name ? (
              <>
                <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
                <div className="text-[12.5px] text-text-faint font-mono mt-1 break-all">
                  {address}
                </div>
                <div className="text-[11px] text-text-faint mt-1 flex items-center gap-1.5">
                  <Icons.user className="w-3 h-3" />
                  Self-attested · the verified address above is the source of truth
                </div>
              </>
            ) : (
              <>
                <h1 className="text-xl font-mono tracking-tight break-all">
                  {truncateAddress(address, 14, 8)}
                </h1>
                <div className="text-[12px] text-text-faint mt-1">
                  This wallet hasn't set a public profile yet.
                </div>
              </>
            )}
            {profile?.content?.bio && (
              <p className="text-[13.5px] text-text-dim mt-4 leading-relaxed max-w-[640px]">
                {profile.content.bio}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        {/* Main */}
        <div className="space-y-6">
          {/* Active jobs as builder */}
          {activeBuilderJobs.length > 0 && (
            <Section title="Currently building">
              <div className="space-y-2">
                {activeBuilderJobs.map((j) => (
                  <Link
                    key={j.id}
                    to={`/app/jobs/${encodeURIComponent(j.id)}`}
                    className="flex items-center justify-between gap-3 p-3 -mx-1 rounded-md hover:bg-surface-2 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-medium truncate">
                        {j.title || "Untitled"}
                      </div>
                      <div className="text-[11.5px] text-text-faint mt-0.5">
                        {j.category} · ₳{formatAda(j.budget)}
                      </div>
                    </div>
                    <Pill status={j.status} />
                  </Link>
                ))}
              </div>
            </Section>
          )}

          {/* Active jobs as client */}
          {activeClientJobs.length > 0 && (
            <Section title="Currently posting">
              <div className="space-y-2">
                {activeClientJobs.map((j) => (
                  <Link
                    key={j.id}
                    to={`/app/jobs/${encodeURIComponent(j.id)}`}
                    className="flex items-center justify-between gap-3 p-3 -mx-1 rounded-md hover:bg-surface-2 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-medium truncate">
                        {j.title || "Untitled"}
                      </div>
                      <div className="text-[11.5px] text-text-faint mt-0.5">
                        {j.category} · ₳{formatAda(j.budget)}
                      </div>
                    </div>
                    <Pill status={j.status} />
                  </Link>
                ))}
              </div>
            </Section>
          )}

          {/* Recent delivered jobs (from rep recent_job_cids) */}
          {rep && rep.recentJobCids.length > 0 && (
            <Section title="Recently delivered">
              <div className="flex flex-col gap-1.5">
                {rep.recentJobCids.map((cid) => (
                  <a
                    key={cid}
                    href={gatewayUrl(cid)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 px-2 py-1.5 -mx-1 rounded text-[12.5px] hover:bg-surface-2"
                  >
                    <span className="flex items-center gap-2 text-text-dim">
                      <Icons.paper className="w-3.5 h-3.5 text-text-faint" />
                      <Cid cid={cid} />
                    </span>
                    <Icons.ext className="w-3 h-3 text-text-faint" />
                  </a>
                ))}
              </div>
            </Section>
          )}

          {/* Empty state if no active and no rep */}
          {!repLoading &&
            !rep &&
            activeBuilderJobs.length === 0 &&
            activeClientJobs.length === 0 && (
              <EmptyState
                icon={<Icons.briefcase className="w-5 h-5" />}
                title="No on-chain activity yet"
                description="This wallet has not posted, won, or delivered any jobs. Reputation accumulates after the first completed job."
              />
            )}
        </div>

        {/* Side — reputation stats */}
        <aside className="space-y-4">
          <Section title="Reputation">
            {repLoading ? (
              <div className="text-[12.5px] text-text-faint">Loading…</div>
            ) : rep ? (
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Completed" value={String(rep.completedJobs)} />
                <Stat
                  label="Volume"
                  value={`₳${formatAda(rep.totalVolume)}`}
                />
                <Stat label="Withdrawals" value={String(rep.withdrawals)} />
                <Stat
                  label="Disputes"
                  value={`${rep.disputesWon}W · ${rep.disputesLost}L`}
                />
                {rep.firstActiveAt && (
                  <div className="col-span-2 pt-2 border-t border-border">
                    <div className="text-[10.5px] uppercase tracking-wider text-text-faint mb-0.5">
                      Member since
                    </div>
                    <div className="text-[12.5px] text-text">
                      {formatRelative(rep.firstActiveAt)}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[12.5px] text-text-faint">
                No reputation yet. A reputation UTxO is created automatically
                when the first paid job releases.
              </div>
            )}
          </Section>
        </aside>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="text-[10.5px] uppercase tracking-wider text-text-faint mb-3">
        {title}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-text-faint mb-0.5">
        {label}
      </div>
      <div className="text-[15px] font-mono font-medium">{value}</div>
    </div>
  );
}
