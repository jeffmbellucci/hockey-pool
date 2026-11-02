import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Menu, Trophy, Users, Target, MessageSquare, ShieldCheck, LogOut, Sun, Moon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "next-themes";

const Navigation = () => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { isAuthenticated, isAdmin, logout, loading, user } = useAuth();
  const { theme, setTheme } = useTheme();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (loading || !isAuthenticated) return null;

  const navItems = [
    { href: "/", label: "Dashboard", icon: Trophy },
    { href: "/two-team", label: "Two-Team", icon: Users },
    { href: "/survivor", label: "Survivor", icon: Target },
    { href: "/chat", label: "Chat", icon: MessageSquare },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];

  const NavLink = ({ item, onClick }: { item: typeof navItems[0]; onClick?: () => void }) => {
    const isActive = location.pathname === item.href;
    return (
      <Link
        to={item.href}
        onClick={onClick}
        className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 ${
          isActive
            ? "bg-white/10 text-white"
            : "text-slate-400 hover:text-white hover:bg-white/[0.06]"
        }`}
      >
        <item.icon className={`h-[18px] w-[18px] flex-shrink-0 ${isActive ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300"}`} />
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <>
      {/* Mobile Top Bar */}
      <header className="md:hidden sticky top-0 z-50 w-full bg-[#0f1117] text-white border-b border-white/[0.06]">
        <div className="flex h-14 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600">
              <Trophy className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-bold tracking-wide">Hockey Pool</span>
          </Link>
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <button className="p-2 rounded-md hover:bg-white/10 transition-colors" aria-label="Open navigation menu">
                <Menu className="h-5 w-5 text-slate-300" />
              </button>
            </SheetTrigger>
            <SheetContent aria-describedby={undefined} side="right" className="w-72 bg-[#0f1117] border-white/[0.06] text-white p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="p-4 border-b border-white/[0.06]">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600">
                    <Trophy className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-sm font-bold tracking-wide">Hockey Pool</span>
                </div>
              </div>
              <div className="p-3 flex flex-col gap-0.5">
                {navItems.map((item) => (
                  <NavLink key={item.href} item={item} onClick={() => setIsOpen(false)} />
                ))}
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/[0.06]">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-slate-500">Theme</span>
                  <button
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className="p-1.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                    aria-label="Toggle theme"
                  >
                    {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </button>
                </div>
                <button
                  onClick={() => { handleLogout(); setIsOpen(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Log out</span>
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-[220px] h-screen sticky top-0 bg-[#0f1117] text-white flex-shrink-0 border-r border-white/[0.06]">
        {/* Logo */}
        <div className="px-5 pt-5 pb-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 shadow-lg shadow-blue-600/20">
              <Trophy className="h-4 w-4 text-white" />
            </div>
            <span className="text-[15px] font-bold tracking-tight">Hockey Pool</span>
          </Link>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 px-3 py-2 flex flex-col gap-0.5 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </nav>

        {/* Footer: theme + user + logout */}
        <div className="px-3 pb-4 pt-2 border-t border-white/[0.06] mt-auto space-y-2">
          {/* Theme toggle row */}
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">Theme</span>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-1.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
          </div>
          {/* User info + logout */}
          <div className="flex items-center gap-2 px-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 text-[11px] font-bold flex-shrink-0">
              {user?.name?.charAt(0).toUpperCase() || "U"}
            </div>
            <span className="text-xs text-slate-300 truncate flex-1">{user?.name || "User"}</span>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
              aria-label="Logout"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Navigation;