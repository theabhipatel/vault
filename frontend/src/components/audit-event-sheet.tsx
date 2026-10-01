import type { ReactNode } from "react"
import { MonitorSmartphone, Server } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { Schemas } from "@/lib/api"
import { actionLabel, describeUserAgent, detailLabel, detailValue, fullDate } from "@/lib/format"

export type AuditEvent = Schemas["ActivityOut"]

function isBrowserReported(event: AuditEvent): boolean {
  return event.details?.source === "browser"
}

export function ResultBadge({ result }: { result: string }) {
  return <Badge variant={result === "success" ? "success" : "destructive"}>{result}</Badge>
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs">{children}</span>
}

/** Everything recorded about one audit event: who, what, when, from where, result and details. */
export function AuditEventSheet({ event, onOpenChange }: { event: AuditEvent | null; onOpenChange: (open: boolean) => void }) {
  const browser = event ? isBrowserReported(event) : false
  const details = Object.entries(event?.details ?? {}).filter(([key]) => key !== "source")

  return (
    <Sheet open={event !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        {event ? (
          <>
            <SheetHeader className="border-b">
              <SheetTitle className="flex flex-wrap items-center gap-2">
                {actionLabel(event.action)} <ResultBadge result={event.result} />
              </SheetTitle>
              <SheetDescription className="font-mono text-xs">{event.action}</SheetDescription>
            </SheetHeader>
            <div className="space-y-6 p-4">
              <div
                className={
                  browser
                    ? "flex gap-3 rounded-lg border border-secure/25 bg-secure-soft p-3 text-sm"
                    : "flex gap-3 rounded-lg border bg-muted/40 p-3 text-sm"
                }
              >
                {browser ? <MonitorSmartphone className="text-secure mt-0.5 size-4 shrink-0" /> : <Server className="text-muted-foreground mt-0.5 size-4 shrink-0" />}
                <p>
                  {browser
                    ? "Reported by the user's browser. Vault unlocks and decryption happen only on the user's device, so the server records what the browser tells it. A modified browser could leave these events out."
                    : "Recorded by the server as part of the request it handled."}
                </p>
              </div>

              <dl className="divide-y">
                <Row label="When">
                  {fullDate(event.created_at)}
                  <span className="text-muted-foreground block">
                    <Mono>{new Date(event.created_at).toISOString()}</Mono>
                  </span>
                </Row>
                <Row label="Who">
                  {event.actor_name ?? "Unknown"}
                  {event.actor_email ? <span className="text-muted-foreground block text-xs">{event.actor_email}</span> : null}
                </Row>
                <Row label="Target">
                  {event.target_label ?? "-"}
                  {event.target_type ? (
                    <span className="text-muted-foreground block text-xs">
                      {event.target_type}
                      {event.target_id ? (
                        <>
                          {" · "}
                          <Mono>{event.target_id}</Mono>
                        </>
                      ) : null}
                    </span>
                  ) : null}
                </Row>
                <Row label="Project">{event.project_name ?? "-"}</Row>
                <Row label="IP address">
                  <Mono>{event.ip ?? "-"}</Mono>
                </Row>
                <Row label="Device">
                  {describeUserAgent(event.user_agent)}
                  {event.user_agent ? <span className="text-muted-foreground block text-xs">{event.user_agent}</span> : null}
                </Row>
              </dl>

              {details.length > 0 ? (
                <section>
                  <h3 className="mb-1 text-sm font-semibold">Details</h3>
                  <dl className="divide-y">
                    {details.map(([key, value]) => (
                      <Row key={key} label={detailLabel(key)}>
                        {detailValue(value)}
                      </Row>
                    ))}
                  </dl>
                </section>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
