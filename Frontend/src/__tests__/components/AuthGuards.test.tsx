import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, Outlet } from "react-router-dom";

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import RequireAuth from "@/components/RequireAuth";
import RequireAdmin from "@/components/RequireAdmin";
import { useAuth } from "@/context/AuthContext";

const mockUseAuth = vi.mocked(useAuth);

describe("RequireAuth", () => {
  test("redirects to /login when not authenticated", () => {
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

    render(
      <MemoryRouter initialEntries={["/protected"]}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/protected" element={<div>Protected</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Login Page")).toBeInTheDocument();
    expect(screen.queryByText("Protected")).toBeNull();
  });

  test("renders children when authenticated", () => {
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

    render(
      <MemoryRouter initialEntries={["/protected"]}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/protected" element={<div>Protected</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Protected")).toBeInTheDocument();
  });
});

describe("RequireAdmin", () => {
  test("redirects non-admin users to /", () => {
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

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<div>Admin Panel</div>} />
          </Route>
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText("Admin Panel")).toBeNull();
  });

  test("renders children for admin users", () => {
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

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<div>Admin Panel</div>} />
          </Route>
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Admin Panel")).toBeInTheDocument();
  });
});
