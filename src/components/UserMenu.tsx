import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, Shield, User, Moon, Sun, Building2, Check, Trophy } from "lucide-react";
import { useTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ContractorAssignment {
  id: string;
  contractor_id: string;
  is_primary: boolean;
}

const UserMenu = () => {
  const { profile, userRole, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [userContractors, setUserContractors] = useState<ContractorAssignment[]>([]);
  const [switching, setSwitching] = useState(false);

  // Fetch user's contractor assignments
  useEffect(() => {
    const fetchContractors = async () => {
      if (!profile?.id) return;
      
      const { data, error } = await supabase
        .from("user_contractor_assignments")
        .select("id, contractor_id, is_primary")
        .eq("user_id", profile.id);
      
      if (!error && data) {
        setUserContractors(data);
      }
    };
    
    fetchContractors();
  }, [profile?.id]);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const switchContractor = async (contractorId: string) => {
    if (!profile?.id) return;
    
    setSwitching(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ active_contractor_id: contractorId })
        .eq("id", profile.id);

      if (error) throw error;

      await refreshProfile();
      toast.success(`Switched to ${contractorId}`);
    } catch (error) {
      console.error("Error switching contractor:", error);
      toast.error("Failed to switch contractor");
    } finally {
      setSwitching(false);
    }
  };

  const activeContractorId = profile?.active_contractor_id || profile?.contractor_id;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 sm:h-10 sm:w-10 rounded-full">
          <Avatar className="h-9 w-9 sm:h-10 sm:w-10">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs sm:text-sm">
              {profile?.full_name ? getInitials(profile.full_name) : "U"}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 bg-background" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{profile?.full_name}</p>
            <p className="text-xs leading-none text-muted-foreground">{profile?.email}</p>
            <p className="text-xs leading-none text-muted-foreground capitalize mt-1">
              {userRole?.replace("_", " ")}
            </p>
            {activeContractorId && (
              <p className="text-xs leading-none text-muted-foreground mt-1">
                Contractor: {activeContractorId}
              </p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/profile')}>
          <User className="mr-2 h-4 w-4" />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('/achievements')}>
          <Trophy className="mr-2 h-4 w-4" />
          <span>Achievements</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={toggleTheme} className="sm:hidden">
          {theme === "dark" ? (
            <>
              <Sun className="mr-2 h-4 w-4" />
              <span>Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="mr-2 h-4 w-4" />
              <span>Dark Mode</span>
            </>
          )}
        </DropdownMenuItem>
        
        {/* Contractor Switcher - only show if user has multiple contractors */}
        {userContractors.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={switching}>
                <Building2 className="mr-2 h-4 w-4" />
                <span>Switch Contractor</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {userContractors.map((uc) => (
                  <DropdownMenuItem
                    key={uc.contractor_id}
                    onClick={() => switchContractor(uc.contractor_id)}
                    className="flex items-center justify-between"
                  >
                    <span>{uc.contractor_id}</span>
                    {activeContractorId === uc.contractor_id && (
                      <Check className="h-4 w-4 text-green-500 ml-2" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
        
        <DropdownMenuSeparator />
        {(userRole === 'admin' || userRole === 'super_admin') && (
          <>
            <DropdownMenuItem onClick={() => navigate('/admin')}>
              <Shield className="mr-2 h-4 w-4" />
              <span>Admin Dashboard</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={() => signOut()}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserMenu;
