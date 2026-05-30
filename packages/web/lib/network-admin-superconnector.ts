import { NextResponse } from "next/server";
import { isWorkspaceDeployment } from "@/lib/deployment";

export function workspaceModeAdminNotFound(): NextResponse | null {
  if (!isWorkspaceDeployment()) return null;
  return new NextResponse("Not Found", { status: 404 });
}
