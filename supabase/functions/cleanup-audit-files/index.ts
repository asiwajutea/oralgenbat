import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.83.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CleanupRequest {
  auditIds: string[];
  deleteZips: boolean;
  deletePhotos: boolean;
}

interface CleanupResult {
  success: boolean;
  summary: {
    auditsProcessed: number;
    zipsDeleted: number;
    photosDeleted: number;
    spaceFeedMb: number;
    errors: string[];
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Verify user has admin or super_admin role
    const { data: hasRole, error: roleError } = await supabase
      .rpc('has_role', { _user_id: user.id, _role: 'admin' });

    const { data: hasSuperRole, error: superRoleError } = await supabase
      .rpc('has_role', { _user_id: user.id, _role: 'super_admin' });

    if (roleError || superRoleError || (!hasRole && !hasSuperRole)) {
      throw new Error('Unauthorized: Admin role required');
    }

    // Parse request body
    const { auditIds, deleteZips, deletePhotos }: CleanupRequest = await req.json();

    if (!auditIds || auditIds.length === 0) {
      throw new Error('No audit IDs provided');
    }

    console.log(`Starting cleanup for ${auditIds.length} audits. User: ${user.id}`);

    let auditsProcessed = 0;
    let zipsDeleted = 0;
    let photosDeleted = 0;
    let totalBytesFreed = 0;
    const errors: string[] = [];

    for (const auditId of auditIds) {
      try {
        // Fetch audit details
        const { data: audit, error: auditError } = await supabase
          .from('audits')
          .select('id, file_name, status, reviewed_at, mobile_zip_url')
          .eq('id', auditId)
          .single();

        if (auditError || !audit) {
          errors.push(`Audit ${auditId}: Not found`);
          continue;
        }

        // Safety checks
        if (audit.status !== 'Audit Passed') {
          errors.push(`Audit ${audit.file_name}: Status is not "Audit Passed"`);
          continue;
        }

        const daysSinceReview = Math.floor(
          (Date.now() - new Date(audit.reviewed_at).getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysSinceReview < 1) {
          errors.push(`Audit ${audit.file_name}: Less than 24 hours old`);
          continue;
        }

        let zipDeleted = false;
        let photoCount = 0;

        // Delete mobile ZIP if requested
        if (deleteZips && audit.mobile_zip_url) {
          try {
            const zipPath = audit.mobile_zip_url.split('/mobile-zips/')[1];
            if (zipPath) {
              const { error: zipDeleteError } = await supabase.storage
                .from('mobile-zips')
                .remove([zipPath]);

              if (!zipDeleteError) {
                // Get file size before deletion for tracking
                const { data: fileData } = await supabase.storage
                  .from('mobile-zips')
                  .list(zipPath.split('/')[0], {
                    search: zipPath.split('/').pop()
                  });

                if (fileData && fileData.length > 0) {
                  totalBytesFreed += fileData[0].metadata?.size || 0;
                }

                zipDeleted = true;
                zipsDeleted++;

                // Update audit record to remove zip URL
                await supabase
                  .from('audits')
                  .update({ mobile_zip_url: null })
                  .eq('id', auditId);
              } else {
                errors.push(`Audit ${audit.file_name}: Failed to delete ZIP - ${zipDeleteError.message}`);
              }
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            errors.push(`Audit ${audit.file_name}: ZIP deletion error - ${errorMsg}`);
          }
        }

        // Delete photos if requested
        if (deletePhotos) {
          try {
            // Fetch photo records
            const { data: photos, error: photosError } = await supabase
              .from('interview_photos')
              .select('id, storage_path')
              .eq('audit_id', auditId);

            if (!photosError && photos && photos.length > 0) {
              // Delete files from storage
              const photoPaths = photos.map(p => p.storage_path);
              const { error: photoDeleteError } = await supabase.storage
                .from('interview-photos')
                .remove(photoPaths);

              if (!photoDeleteError) {
                // Delete photo records from database
                await supabase
                  .from('interview_photos')
                  .delete()
                  .eq('audit_id', auditId);

                photoCount = photos.length;
                photosDeleted += photoCount;
              } else {
                errors.push(`Audit ${audit.file_name}: Failed to delete photos - ${photoDeleteError.message}`);
              }
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            errors.push(`Audit ${audit.file_name}: Photo deletion error - ${errorMsg}`);
          }
        }

        // Log to cleanup audit trail
        await supabase
          .from('audit_file_cleanup_log')
          .insert({
            audit_id: auditId,
            deleted_by: user.id,
            zip_url: audit.mobile_zip_url,
            zip_deleted: zipDeleted,
            photos_deleted: photoCount,
            notes: `Deleted by admin cleanup. Days since review: ${daysSinceReview}`
          });

        auditsProcessed++;
        console.log(`Processed audit ${audit.file_name}: ZIP=${zipDeleted}, Photos=${photoCount}`);

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`Audit ${auditId}: ${errorMsg}`);
        console.error(`Error processing audit ${auditId}:`, err);
      }
    }

    const result: CleanupResult = {
      success: true,
      summary: {
        auditsProcessed,
        zipsDeleted,
        photosDeleted,
        spaceFeedMb: Math.round((totalBytesFreed / (1024 * 1024)) * 100) / 100,
        errors
      }
    };

    console.log('Cleanup complete:', result.summary);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMsg 
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
