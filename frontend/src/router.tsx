import { Navigate, createBrowserRouter } from "react-router"

import { AppShell, HomeRedirect, PublicOnly, RequireAuth } from "@/components/layout/app-shell"
import { WorkspaceLayout } from "@/components/layout/workspace-context"
import { CheckEmailPage, ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from "@/routes/auth/email-flows"
import { LoginPage } from "@/routes/auth/login"
import { SignupPage } from "@/routes/auth/signup"
import { AuditPage } from "@/routes/audit"
import { DashboardPage } from "@/routes/dashboard"
import { DocumentPage } from "@/routes/document"
import { InvitationsPage, NotificationsPage } from "@/routes/inbox"
import { MembersPage } from "@/routes/members"
import { NotFoundContent, NotFoundPage } from "@/routes/not-found"
import { OnboardingPage } from "@/routes/onboarding"
import { ProjectPage } from "@/routes/project"
import { ProjectsPage } from "@/routes/projects"
import { RolesPage } from "@/routes/roles"
import { SettingsLayout } from "@/routes/settings/layout"
import { AccountSection, AppearanceSection, ProfileSection, SecuritySection } from "@/routes/settings/sections"
import { VaultSection } from "@/routes/settings/vault"
import { WorkspaceSettingsPage } from "@/routes/workspace-settings"

export const router = createBrowserRouter([
  {
    element: <PublicOnly />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/signup", element: <SignupPage /> },
      { path: "/check-email", element: <CheckEmailPage /> },
      { path: "/verify-email", element: <VerifyEmailPage /> },
      { path: "/forgot-password", element: <ForgotPasswordPage /> },
      { path: "/reset-password", element: <ResetPasswordPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      { path: "/app", element: <HomeRedirect /> },
      { path: "/onboarding", element: <OnboardingPage /> },
      {
        element: <AppShell />,
        children: [
          {
            path: "/w/:workspaceId",
            element: <WorkspaceLayout />,
            children: [
              { index: true, element: <DashboardPage /> },
              { path: "projects", element: <ProjectsPage /> },
              { path: "projects/:projectId", element: <ProjectPage /> },
              { path: "projects/:projectId/docs/:documentId", element: <DocumentPage /> },
              { path: "members", element: <MembersPage /> },
              { path: "roles", element: <RolesPage /> },
              { path: "audit", element: <AuditPage /> },
              { path: "settings", element: <WorkspaceSettingsPage /> },
              { path: "*", element: <NotFoundContent /> },
            ],
          },
          {
            path: "/settings",
            element: <SettingsLayout />,
            children: [
              { index: true, element: <Navigate to="/settings/profile" replace /> },
              { path: "profile", element: <ProfileSection /> },
              { path: "appearance", element: <AppearanceSection /> },
              { path: "security", element: <SecuritySection /> },
              { path: "vault", element: <VaultSection /> },
              { path: "account", element: <AccountSection /> },
            ],
          },
          { path: "/notifications", element: <NotificationsPage /> },
          { path: "/invitations", element: <InvitationsPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
])
