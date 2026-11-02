import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { Eye, EyeOff, Lock, Mail, AlertCircle } from "lucide-react";
import gsap from "gsap";

const schema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(4, "Password must be at least 4 characters"),
});

type FormValues = z.infer<typeof schema>;

/* ── Rink-line decorative SVG ── */
const RinkLines = () => (
  <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="rink-pattern" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse">
        <circle cx="60" cy="60" r="40" stroke="white" strokeWidth="1" fill="none" />
        <line x1="0" y1="60" x2="120" y2="60" stroke="white" strokeWidth="0.5" />
        <line x1="60" y1="0" x2="60" y2="120" stroke="white" strokeWidth="0.5" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#rink-pattern)" />
  </svg>
);

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation() as { state: { from?: Location } };
  const { login, isAuthenticated, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [loading, isAuthenticated, navigate]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      await login(values.email, values.password);
      const redirectTo = (location.state?.from as any)?.pathname || "/";
      navigate(redirectTo, { replace: true });
    } catch (e: any) {
      setError(e?.message ?? "Failed to login");
    }
  };

  const sceneRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sceneRef.current || !cardRef.current) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      // Spotlight sweeps in
      tl.fromTo(
        spotlightRef.current,
        { opacity: 0, scale: 1.5, y: -80 },
        { opacity: 1, scale: 1, y: 0, duration: 1.2 }
      );

      // Card drops in like a puck
      tl.fromTo(
        cardRef.current,
        { y: -60, opacity: 0, scale: 0.95 },
        { y: 0, opacity: 1, scale: 1, duration: 0.9, ease: "back.out(1.4)" },
        "-=0.6"
      );

      // Stagger form rows
      tl.fromTo(
        ".login-row",
        { x: -30, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.6, stagger: 0.1 },
        "-=0.4"
      );

      // CTA button pulse
      tl.fromTo(
        ".login-cta",
        { scale: 0.9, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.5, ease: "elastic.out(1, 0.5)" },
        "-=0.2"
      );
    }, sceneRef);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={sceneRef}
      className="fixed inset-0 z-50 flex items-center justify-center w-screen h-screen overflow-hidden"
      style={{ background: "linear-gradient(165deg, #0a0e1a 0%, #0d1525 40%, #111b2e 70%, #0a0e1a 100%)" }}
    >
      {/* Rink pattern overlay */}
      <RinkLines />

      {/* Arena spotlight — top-center cone of light */}
      <div
        ref={spotlightRef}
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[500px] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, rgba(100,160,255,0.08) 0%, rgba(100,160,255,0.03) 40%, transparent 70%)",
        }}
      />

      {/* Faint red goal-line glow — bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1 pointer-events-none"
        style={{ background: "linear-gradient(90deg, transparent 15%, hsl(0 72% 51% / 0.5) 50%, transparent 85%)" }}
      />

      {/* Ambient ice particles (CSS-only) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white/5"
            style={{
              width: `${3 + i * 2}px`,
              height: `${3 + i * 2}px`,
              left: `${15 + i * 14}%`,
              top: `${10 + (i % 3) * 30}%`,
              animation: `float-particle ${4 + i}s ease-in-out infinite alternate`,
              animationDelay: `${i * 0.6}s`,
            }}
          />
        ))}
      </div>

      {/* ── Main Card ── */}
      <div ref={cardRef} className="relative w-full max-w-[420px] mx-4 z-10">
        {/* Glow ring behind card */}
        <div
          className="absolute -inset-[1px] rounded-2xl pointer-events-none"
          style={{
            background: "linear-gradient(135deg, rgba(100,160,255,0.2) 0%, transparent 50%, rgba(255,59,48,0.15) 100%)",
          }}
        />

        <div
          className="relative rounded-2xl p-8 sm:p-10"
          style={{
            background: "linear-gradient(180deg, rgba(15,22,40,0.95) 0%, rgba(10,14,26,0.98) 100%)",
            backdropFilter: "blur(40px)",
            boxShadow: "0 25px 60px -12px rgba(0,0,0,0.7), 0 0 80px -20px rgba(100,160,255,0.08), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          {/* Scoreboard-style top accent */}
          <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />

          {/* ── Header ── */}
          <div className="text-center mb-8 login-row">
            <h1
              className="text-[28px] sm:text-[32px] font-black tracking-[0.08em] leading-none"
              style={{
                fontFamily: "'Oswald', 'Bebas Neue', system-ui, sans-serif",
                background: "linear-gradient(180deg, #e8edf5 30%, #8ba3c7 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              HOCKEY POOL
            </h1>

            <div className="flex items-center justify-center gap-3 mt-3">
              <span className="h-px w-8 bg-gradient-to-r from-transparent to-blue-500/30" />
              <span
                className="text-[11px] font-semibold tracking-[0.25em] uppercase"
                style={{ color: "rgba(140,170,220,0.6)" }}
              >
                Player Portal
              </span>
              <span className="h-px w-8 bg-gradient-to-l from-transparent to-blue-500/30" />
            </div>
          </div>

          {/* ── Form ── */}
          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
            {/* Email field */}
            <div className="login-row">
              <label
                htmlFor="email"
                className="block text-[11px] font-semibold tracking-[0.18em] uppercase mb-2"
                style={{ color: "rgba(140,170,220,0.5)" }}
              >
                Email
              </label>
              <div
                className="relative group rounded-xl transition-all duration-300"
                style={{
                  boxShadow: focused === "email"
                    ? "0 0 0 1px rgba(100,160,255,0.3), 0 0 20px -5px rgba(100,160,255,0.15)"
                    : "0 0 0 1px rgba(255,255,255,0.06)",
                }}
              >
                <Mail
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-300 pointer-events-none"
                  style={{ color: focused === "email" ? "rgba(100,160,255,0.8)" : "rgba(140,170,220,0.3)" }}
                />
                <Input
                  id="email"
                  type="email"
                  placeholder="player@example.com"
                  className="h-12 pl-11 pr-4 bg-white/[0.03] border-0 text-[14px] text-slate-200 placeholder:text-slate-600 rounded-xl focus-visible:ring-0 focus-visible:ring-offset-0"
                  {...register("email")}
                  onFocus={() => setFocused("email")}
                  onBlur={() => setFocused(null)}
                />
              </div>
              {errors.email && (
                <p className="text-[12px] text-red-400 flex items-center gap-1.5 mt-1.5 pl-1">
                  <AlertCircle className="h-3 w-3 shrink-0" /> {errors.email.message}
                </p>
              )}
            </div>

            {/* Password field */}
            <div className="login-row">
              <label
                htmlFor="password"
                className="block text-[11px] font-semibold tracking-[0.18em] uppercase mb-2"
                style={{ color: "rgba(140,170,220,0.5)" }}
              >
                Password
              </label>
              <div
                className="relative group rounded-xl transition-all duration-300"
                style={{
                  boxShadow: focused === "password"
                    ? "0 0 0 1px rgba(100,160,255,0.3), 0 0 20px -5px rgba(100,160,255,0.15)"
                    : "0 0 0 1px rgba(255,255,255,0.06)",
                }}
              >
                <Lock
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-300 pointer-events-none"
                  style={{ color: focused === "password" ? "rgba(100,160,255,0.8)" : "rgba(140,170,220,0.3)" }}
                />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="h-12 pl-11 pr-12 bg-white/[0.03] border-0 text-[14px] text-slate-200 placeholder:text-slate-600 rounded-xl focus-visible:ring-0 focus-visible:ring-offset-0"
                  {...register("password")}
                  onFocus={() => setFocused("password")}
                  onBlur={() => setFocused(null)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors hover:bg-white/5"
                  style={{ color: "rgba(140,170,220,0.4)" }}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-[12px] text-red-400 flex items-center gap-1.5 mt-1.5 pl-1">
                  <AlertCircle className="h-3 w-3 shrink-0" /> {errors.password.message}
                </p>
              )}
            </div>

            {/* Error banner */}
            {error && (
              <div
                className="login-row flex items-center gap-2.5 px-4 py-3 rounded-xl text-[13px] font-medium"
                style={{
                  background: "rgba(255,59,48,0.08)",
                  border: "1px solid rgba(255,59,48,0.15)",
                  color: "#ff6b6b",
                }}
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Submit button */}
            <div className="login-cta pt-2">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="relative w-full h-[52px] rounded-xl border-0 font-bold text-[14px] tracking-[0.12em] uppercase overflow-hidden transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:hover:scale-100"
                style={{
                  background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%)",
                  color: "#fff",
                  boxShadow: "0 4px 20px -4px rgba(37,99,235,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
                }}
              >
                {/* Shine sweep on hover */}
                <span
                  className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{
                    background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.08) 45%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.08) 55%, transparent 60%)",
                  }}
                />
                {isSubmitting ? (
                  <span className="flex items-center gap-2.5">
                    <span className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                    Authenticating...
                  </span>
                ) : (
                  "Enter the Rink"
                )}
              </Button>
            </div>
          </form>

          {/* Bottom decorative line */}
          <div className="absolute bottom-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
        </div>
      </div>

      {/* Floating ice particle keyframes */}
      <style>{`
        @keyframes float-particle {
          0% { transform: translateY(0) scale(1); opacity: 0.3; }
          100% { transform: translateY(-20px) scale(1.5); opacity: 0.08; }
        }
      `}</style>
    </div>
  );
};

export default Login;


