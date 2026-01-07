import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  contractor_id: string;
  is_approved: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  userRole: string | null;
  isApproved: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isFetchingProfile, setIsFetchingProfile] = useState(false);
  const navigate = useNavigate();

  const fetchProfileAndRole = async (userId: string) => {
    // Prevent duplicate fetches that cause rate limiting
    if (isFetchingProfile) return;
    setIsFetchingProfile(true);
    
    try {
      // Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (profileError) throw profileError;

      setProfile(profileData);
      setIsApproved(profileData?.is_approved || false);

      // Fetch role - use maybeSingle to handle 0 or 1 roles gracefully
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (roleError) {
        console.error("Error fetching role:", roleError);
        setUserRole(null);
      } else {
        setUserRole(roleData?.role || null);
      }
    } catch (error) {
      console.error("Error fetching profile and role:", error);
    } finally {
      setLoading(false);
      setIsFetchingProfile(false);
    }
  };

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Synchronous state updates only
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Keep loading true while we fetch the profile
          // This prevents race condition where isApproved is checked before profile loads
          setLoading(true);
          // CRITICAL: Defer Supabase calls to prevent auth deadlock
          // Making async Supabase calls inside onAuthStateChange can cause
          // infinite token refresh loops leading to 429 rate limit errors
          setTimeout(() => {
            fetchProfileAndRole(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setUserRole(null);
          setIsApproved(false);
          setLoading(false);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Keep loading true while we fetch the profile
        setLoading(true);
        // Also defer here for consistency
        setTimeout(() => {
          fetchProfileAndRole(session.user.id);
        }, 0);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setUserRole(null);
    setIsApproved(false);
    navigate("/auth");
  };

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfileAndRole(user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        userRole,
        isApproved,
        loading,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
