import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowRight, Building2, LogOut } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { z } from "zod"

import { Logo } from "@/components/brand"
import { SetupVaultFlow } from "@/components/vault/vault-dialogs"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { qk, useMe } from "@/hooks/api"
import { useSignOut } from "@/hooks/session"
import { client, errorMessage, unwrap } from "@/lib/api"
import { setLastWorkspace } from "@/lib/last-workspace"
import { cn } from "@/lib/utils"
import { useVault } from "@/vault/vault-context"

const schema = z.object({ name: z.string().trim().min(1, "Give your workspace a name.").max(80) })

const STEPS = ["Name your workspace", "Secure your vault", "Invite your team"]

export function OnboardingPage() {
  const { data: me } = useMe()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const signOut = useSignOut()
  const firstName = me?.name.split(" ")[0] ?? ""
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: firstName ? `${firstName}'s workspace` : "" },
  })

  const vault = useVault()
  const [createdId, setCreatedId] = useState<string | null>(null)
  const finish = (id: string) => navigate(`/w/${id}?welcome=1`, { replace: true })

  const create = useMutation({
    mutationFn: (name: string) => unwrap(client.POST("/api/workspaces", { body: { name } })),
    onSuccess: async (ws) => {
      setLastWorkspace(ws.id)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.me }),
        queryClient.invalidateQueries({ queryKey: qk.workspaces }),
      ])
      // Step 2: a gentle, skippable prompt to create the vault password.
      if (vault.status === "none") setCreatedId(ws.id)
      else finish(ws.id)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const current = createdId ? 1 : 0

  return (
    <div className="bg-vault-glow relative flex min-h-dvh flex-col">
      <div className="bg-vault-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_65%)]" aria-hidden="true" />
      <header className="relative flex items-center justify-between px-4 py-5 sm:px-8">
        <Logo />
        <Button variant="ghost" size="sm" onClick={() => signOut.mutate()}>
          <LogOut /> Sign out
        </Button>
      </header>
      <main className="relative flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:pt-16">
        <div className="w-full max-w-lg">
          <ol className="mb-8 flex items-center gap-2" aria-label="Setup progress">
            {STEPS.map((step, i) => (
              <li key={step} className="flex flex-1 flex-col gap-2">
                <span className={cn("h-1 rounded-full", i <= current ? "bg-brand" : "bg-border")} />
                <span className={cn("text-xs", i === current ? "text-foreground font-medium" : "text-muted-foreground")}>
                  {step}
                </span>
              </li>
            ))}
          </ol>
          {createdId ? (
            <Card className="shadow-lg">
              <CardContent className="py-2">
                <SetupVaultFlow onDone={() => finish(createdId)} onCancel={() => finish(createdId)} cancelLabel="Skip for now" />
              </CardContent>
            </Card>
          ) : (
          <Card className="shadow-lg">
            <CardContent className="space-y-6 py-2">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand ring-1 ring-brand/20">
                <Building2 className="size-6" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold">Welcome{firstName ? `, ${firstName}` : ""}. Let's set up your workspace.</h1>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  A workspace holds your team's projects, documents and secrets. You'll be its owner, and it becomes your
                  default. You can create or join others any time.
                </p>
              </div>
              <form onSubmit={form.handleSubmit((v) => create.mutate(v.name))} noValidate>
                <FieldGroup>
                  <Field data-invalid={Boolean(form.formState.errors.name)}>
                    <FieldLabel htmlFor="ws-name">Workspace name</FieldLabel>
                    <Input id="ws-name" autoFocus {...form.register("name")} />
                    <FieldDescription>Usually your company or team name. You can rename it later.</FieldDescription>
                    <FieldError errors={[form.formState.errors.name]} />
                  </Field>
                  <Button type="submit" size="lg" className="w-full" disabled={create.isPending}>
                    {create.isPending ? <Spinner /> : null} Create workspace <ArrowRight />
                  </Button>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
          )}
        </div>
      </main>
    </div>
  )
}
