import { Terminal, Puzzle, Users, FolderOpen, Activity, Settings, Archive, FileText, Radio } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import hellcoreLogo from "@/assets/hellcore-logo.webp";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";

const mainItems = [
  { title: "Console", url: "/", icon: Terminal },
  { title: "File Manager", url: "/files", icon: FolderOpen },
  { title: "Plugins", url: "/plugins", icon: Puzzle },
  { title: "Users", url: "/users", icon: Users },
  { title: "Live Players", url: "/players", icon: Radio },
];

const systemItems = [
  { title: "Backups", url: "/backups", icon: Archive },
  { title: "Logs", url: "/logs", icon: FileText },
  { title: "Server Status", url: "/status", icon: Activity },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function PanelSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <img src={hellcoreLogo} alt="HellCore" className="h-9 w-9 shrink-0 rounded-lg" />
          {!collapsed && (
            <div>
              <h2 className="text-sm font-bold text-foreground">HellCore</h2>
              <p className="text-xs text-muted-foreground">Server Panel</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground/60">Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.url === "/"} className="transition-colors hover:bg-surface-hover" activeClassName="bg-primary/10 text-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground/60">System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {systemItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} className="transition-colors hover:bg-surface-hover" activeClassName="bg-primary/10 text-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        {!collapsed && (
          <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-medium text-primary">Online</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">12 players • 4 games</p>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
