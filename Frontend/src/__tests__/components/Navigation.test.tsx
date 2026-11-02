import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";

// Mock useAuth before importing Navigation
vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

// Mock next-themes
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme: vi.fn() }),
}));

import Navigation from "@/components/Navigation";
import { useAuth } from "@/context/AuthContext";

const mockUseAuth = vi.mocked(useAuth);

function renderNav() {
  return render(
    <BrowserRouter>
      <Navigation />
    </BrowserRouter>
  );
}

describe("Navigation", () => {
  test("returns null when loading", () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isAdmin: false,
      loading: true,
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
      updateProfile: vi.fn(),
      refreshUser: vi.fn(),
    });

    const { container } = renderNav();
    expect(container.innerHTML).toBe("");
  });

  test("returns null when not authenticated", () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isAdmin: false,
      loading: false,
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
      updateProfile: vi.fn(),
      refreshUser: vi.fn(),
    });

    const { container } = renderNav();
    expect(container.innerHTML).toBe("");
  });

  test("shows nav items when authenticated", () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isAdmin: false,
      loading: false,
      user: { id: 1, name: "Test", lastName: "Player", email: "t@t.com", role: "player", active: true },
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
      updateProfile: vi.fn(),
      refreshUser: vi.fn(),
    });

    renderNav();
    // Desktop sidebar should have the core links
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Two-Team").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Survivor").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Chat").length).toBeGreaterThan(0);
  });

  test("shows admin link for admin users", () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isAdmin: true,
      loading: false,
      user: { id: 1, name: "Admin", lastName: "Player", email: "a@t.com", role: "admin", active: true },
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
      updateProfile: vi.fn(),
      refreshUser: vi.fn(),
    });

    renderNav();
    expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
  });

  test("hides admin link for regular users", () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isAdmin: false,
      loading: false,
      user: { id: 2, name: "Player", lastName: "Test", email: "p@t.com", role: "player", active: true },
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
      updateProfile: vi.fn(),
      refreshUser: vi.fn(),
    });

    renderNav();
    expect(screen.queryByText("Admin")).toBeNull();
  });
});
