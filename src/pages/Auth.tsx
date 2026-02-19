import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { z } from "zod";

const signupSchema = z
  .object({
    fullName: z.string().min(2, "Full name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    phone: z.string().min(10, "Phone number must be at least 10 characters"),
    contractorId: z.enum(["NG68", "NG71", "NG75"], {
      errorMap: () => ({ message: "Please select a contractor ID" }),
    }),
    role: z.enum(
      ["field_manager", "auditor", "contractor", "sub_contractor", "data_entry_clerk", "quality_assurance_manager"],
      { errorMap: () => ({ message: "Please select a role" }) },
    ),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const Auth = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  // Password visibility state
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);

  // Signup form state
  const [signupData, setSignupData] = useState({
    fullName: "",
    email: "",
    phone: "",
    contractorId: "",
    role: "",
    password: "",
    confirmPassword: "",
  });

  // Login form state
  const [loginData, setLoginData] = useState({
    email: "",
    password: "",
  });

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const validatedData = signupSchema.parse(signupData);
      const redirectUrl = `${window.location.origin}/`;

      const { error } = await supabase.auth.signUp({
        email: validatedData.email,
        password: validatedData.password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: validatedData.fullName,
            phone: validatedData.phone,
            contractor_id: validatedData.contractorId,
            role: validatedData.role,
          },
        },
      });

      if (error) throw error;

      toast.success("Account created! Please wait for admin approval before logging in.");

      await supabase.auth.signOut();

      setSignupData({
        fullName: "",
        email: "",
        phone: "",
        contractorId: "",
        role: "",
        password: "",
        confirmPassword: "",
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else if (error.message.includes("User already registered")) {
        toast.error("An account with this email already exists");
      } else {
        toast.error(error.message || "Failed to create account");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const validatedData = loginSchema.parse(loginData);

      const { error } = await supabase.auth.signInWithPassword({
        email: validatedData.email,
        password: validatedData.password,
      });

      if (error) throw error;

      toast.success("Logged in successfully!");
      navigate("/");
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else if (error.message.includes("Invalid login credentials")) {
        toast.error("Invalid email or password");
      } else {
        toast.error(error.message || "Failed to login");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Backend Audit Tool (BAT)</CardTitle>
          <CardDescription className="text-center">Sign in to your account or create a new one</CardDescription>
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            {/* LOGIN */}
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={loginData.email}
                    onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Password</Label>
                  <div className="relative">
                    <Input
                      type={showLoginPassword ? "text" : "password"}
                      value={loginData.password}
                      onChange={(e) =>
                        setLoginData({
                          ...loginData,
                          password: e.target.value,
                        })
                      }
                      required
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
                      onClick={() => setShowLoginPassword((prev) => !prev)}
                    >
                      {showLoginPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Logging in..." : "Login"}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-foreground underline"
                    onClick={async () => {
                      if (!loginData.email) {
                        toast.error("Please enter your email address first");
                        return;
                      }
                      try {
                        const { error } = await supabase.auth.resetPasswordForEmail(loginData.email, {
                          redirectTo: `${window.location.origin}/reset-password`,
                        });
                        if (error) throw error;
                        toast.success("Password reset email sent! Check your inbox.");
                      } catch (err: any) {
                        toast.error(err.message || "Failed to send reset email");
                      }
                    }}
                  >
                    Forgot Password?
                  </button>
                </div>
              </form>
            </TabsContent>

            {/* SIGNUP */}
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <Input
                  placeholder="Full Name"
                  value={signupData.fullName}
                  onChange={(e) =>
                    setSignupData({
                      ...signupData,
                      fullName: e.target.value,
                    })
                  }
                  required
                />

                <Input
                  type="email"
                  placeholder="Email"
                  value={signupData.email}
                  onChange={(e) => setSignupData({ ...signupData, email: e.target.value })}
                  required
                />

                <Input
                  placeholder="Phone"
                  value={signupData.phone}
                  onChange={(e) => setSignupData({ ...signupData, phone: e.target.value })}
                  required
                />

                <Select
                  value={signupData.contractorId}
                  onValueChange={(value) => setSignupData({ ...signupData, contractorId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select contractor ID" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NG68">NG68</SelectItem>
                    <SelectItem value="NG71">NG71</SelectItem>
                    <SelectItem value="NG75">NG75</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={signupData.role}
                  onValueChange={(value) => setSignupData({ ...signupData, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auditor">Auditor</SelectItem>
                    <SelectItem value="contractor">Contractor</SelectItem>
                    <SelectItem value="data_entry_clerk">Data Entry Clerk</SelectItem>
                    <SelectItem value="field_manager">Field Manager</SelectItem>
                    <SelectItem value="quality_assurance_manager">Quality Assurance Manager</SelectItem>
                    <SelectItem value="sub_contractor">Sub-contractor</SelectItem>
                  </SelectContent>
                </Select>

                <div className="relative">
                  <Input
                    type={showSignupPassword ? "text" : "password"}
                    placeholder="Password"
                    value={signupData.password}
                    onChange={(e) =>
                      setSignupData({
                        ...signupData,
                        password: e.target.value,
                      })
                    }
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
                    onClick={() => setShowSignupPassword((prev) => !prev)}
                  >
                    {showSignupPassword ? "Hide" : "Show"}
                  </button>
                </div>

                <div className="relative">
                  <Input
                    type={showSignupConfirmPassword ? "text" : "password"}
                    placeholder="Confirm Password"
                    value={signupData.confirmPassword}
                    onChange={(e) =>
                      setSignupData({
                        ...signupData,
                        confirmPassword: e.target.value,
                      })
                    }
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
                    onClick={() => setShowSignupConfirmPassword((prev) => !prev)}
                  >
                    {showSignupConfirmPassword ? "Hide" : "Show"}
                  </button>
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Creating account..." : "Sign Up"}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  Your account will require admin approval before you can access the system.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
