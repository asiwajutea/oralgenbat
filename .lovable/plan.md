
# Implementation Plan: Payment Tracking Enhancement & In-App Announcements

## Overview

This plan addresses two major feature requests:

### Feature 1: Editable Total Names on Invoice Entry
Allow users to edit the sum total of names directly in the Manual Invoice Entry dialog (the "22,675" shown in the preview stats), not just individual interview counts.

### Feature 2: In-App Announcement System
Create a comprehensive notification/announcement system with:
- Role-based announcement creation (Super Admin, Contractor, Sub-Contractor, QA Manager)
- Targeting options (all users, contractor group, role, specific users)
- Scheduling and auto-delete capabilities
- Modern modal UI with customizable display frequency
- Dedicated Notice Board page for reading past announcements
- Push notification integration

---

## Feature 1: Editable Total Names

### Current Behavior
The `ManualInvoiceEntryDialog` calculates total names from individual interview records. Users can only edit per-interview counts.

### Required Changes

**Modify `ManualInvoiceEntryDialog.tsx`:**
1. Add a new `totalNamesOverride` state that allows direct editing of the aggregate total
2. Add an edit button next to the "Total Names: X" badge in the preview section
3. When the override is set, distribute proportionally or use as-is for invoice recording
4. Store the override value for accurate stats

**UI Flow:**
```text
Preview Section:
+-----------------------------------------------+
| Found: 209 | Not Found: 1 | Total Names: 22,675 [Edit icon] |
+-----------------------------------------------+
```

When user clicks edit on Total Names:
- Show inline input or modal for entering the correct total
- Save this as `totalNamesOverride` 
- Display the overridden value with an indicator that it was manually adjusted

---

## Feature 2: In-App Announcement System

### Database Schema

**New Table: `announcements`**
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| title | text | Announcement title |
| content | text | Main announcement body |
| cta_text | text? | Optional CTA button text |
| cta_url | text? | Optional CTA button URL |
| created_by | uuid | Creator user ID |
| created_at | timestamp | Creation timestamp |
| scheduled_at | timestamp? | Future publish date (null = immediate) |
| expires_at | timestamp? | Auto-delete after this date |
| is_active | boolean | Whether announcement is visible |
| display_frequency | text | 'once', 'every_login', 'daily', 'weekly' |
| require_acknowledgment | boolean | User must check box to dismiss |
| target_type | text | 'all', 'contractor', 'role', 'user' |
| target_contractor_id | text? | If targeting contractor group |
| target_role | app_role? | If targeting specific role |
| target_user_ids | uuid[]? | If targeting specific users |
| priority | integer | Display order (higher = more important) |
| style | text | 'info', 'warning', 'success', 'announcement' |

**New Table: `announcement_dismissals`**
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| announcement_id | uuid | FK to announcements |
| user_id | uuid | User who dismissed |
| dismissed_at | timestamp | When dismissed |
| acknowledged | boolean | If acknowledged (for require_acknowledgment) |

### RLS Policies

**announcements:**
- Super Admins can manage all announcements
- Contractors can create announcements targeting their contractor group
- Sub-Contractors can create announcements for their assigned field managers
- QA Managers can create announcements for data entry teams
- All authenticated users can read active announcements that target them

**announcement_dismissals:**
- Users can insert/read their own dismissals
- Service role can manage all

### Creator Permission Logic

| Creator Role | Can Target |
|-------------|------------|
| Super Admin | All users, any contractor, any role, specific users |
| Contractor | Users in their contractor group only |
| Sub-Contractor | Field managers assigned to them |
| QA Manager | Data entry clerks and QA managers |

### New Components

**1. `AnnouncementModal.tsx`**
Modern, visually appealing modal that appears on login:
- Glassmorphism or gradient background
- Wrapped text content
- Optional CTA button (primary styling)
- Minimal close button (top-right X)
- Optional acknowledgment checkbox
- Smooth animations (fade/slide in)

**2. `AnnouncementProvider.tsx`**
Context provider that:
- Fetches pending announcements on auth state change
- Checks dismissal status and frequency rules
- Queues announcements for display
- Handles the display logic based on frequency settings

**3. `NoticeBoard.tsx` (New Page)**
Dedicated page at `/notices` where users can:
- View all announcements (past and current)
- Filter by date, priority, read status
- Mark as read/acknowledged

**4. `CreateAnnouncementDialog.tsx`**
Admin dialog for creating announcements with:
- Rich text input (title, content)
- Target selection (dropdown with role-based options)
- Schedule date picker
- Expiry date picker  
- Display frequency selector
- Require acknowledgment toggle
- CTA configuration (optional)
- Priority level selector
- Style/theme selector

### Integration Points

**Layout.tsx:**
Add `<AnnouncementProvider>` wrapper that checks for pending announcements on mount

**NotificationBell.tsx:**
Add announcement icon type and link announcements to Notice Board

**useNotifications.ts:**
Extend to create user_notifications when new announcements are published (for push notifications)

### Files to Create

| File | Purpose |
|------|---------|
| `src/components/announcements/AnnouncementModal.tsx` | Display modal for announcements |
| `src/components/announcements/AnnouncementProvider.tsx` | Context for managing announcement display |
| `src/components/announcements/CreateAnnouncementDialog.tsx` | Create/edit announcements |
| `src/components/announcements/AnnouncementCard.tsx` | Card component for Notice Board |
| `src/pages/NoticeBoard.tsx` | Dedicated page for viewing all announcements |
| `src/hooks/useAnnouncements.ts` | Data fetching and mutations for announcements |

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/payment/ManualInvoiceEntryDialog.tsx` | Add editable total names override |
| `src/components/Layout.tsx` | Add AnnouncementProvider |
| `src/components/NotificationBell.tsx` | Add announcement notification type |
| `src/App.tsx` | Add /notices route |
| `src/hooks/useNotifications.ts` | Add announcement notification type |
| Database Migration | Create announcements tables and policies |

---

## Technical Details

### Announcement Display Logic

```typescript
// Determine if announcement should show
function shouldShowAnnouncement(announcement, dismissals, lastLoginAt) {
  const dismissal = dismissals.find(d => d.announcement_id === announcement.id);
  
  if (!dismissal) return true;
  
  switch (announcement.display_frequency) {
    case 'once':
      return false; // Already dismissed
    case 'every_login':
      return dismissal.dismissed_at < lastLoginAt;
    case 'daily':
      return isMoreThanOneDayAgo(dismissal.dismissed_at);
    case 'weekly':
      return isMoreThanOneWeekAgo(dismissal.dismissed_at);
  }
}
```

### Target Matching Logic

```typescript
// Check if announcement targets current user
function isTargetedToUser(announcement, user, userRole, profile) {
  switch (announcement.target_type) {
    case 'all':
      return true;
    case 'contractor':
      return profile.contractor_id === announcement.target_contractor_id 
          || profile.active_contractor_id === announcement.target_contractor_id;
    case 'role':
      return userRole === announcement.target_role;
    case 'user':
      return announcement.target_user_ids?.includes(user.id);
  }
}
```

### Modern Modal UI Design

```text
+------------------------------------------------+
|                                           [X]  |
|                                                |
|     [Icon based on style]                      |
|                                                |
|     ANNOUNCEMENT TITLE                         |
|                                                |
|     Lorem ipsum dolor sit amet,                |
|     consectetur adipiscing elit.               |
|     Sed do eiusmod tempor incididunt           |
|     ut labore et dolore magna aliqua.          |
|                                                |
|     [ ] I have read and acknowledged           |
|         this announcement                      |
|                                                |
|           [Optional CTA Button]                |
|                                                |
+------------------------------------------------+
```

**Styling Features:**
- Backdrop blur effect
- Gradient or themed header based on style
- Smooth entrance animation (scale + fade)
- Rounded corners, soft shadows
- Responsive sizing (max-width with padding)

---

## Database Migration SQL

```sql
-- Announcements table
CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  cta_text text,
  cta_url text,
  created_by uuid REFERENCES profiles(id) NOT NULL,
  created_at timestamptz DEFAULT now(),
  scheduled_at timestamptz,
  expires_at timestamptz,
  is_active boolean DEFAULT true,
  display_frequency text DEFAULT 'once' CHECK (display_frequency IN ('once', 'every_login', 'daily', 'weekly')),
  require_acknowledgment boolean DEFAULT false,
  target_type text DEFAULT 'all' CHECK (target_type IN ('all', 'contractor', 'role', 'user')),
  target_contractor_id text,
  target_role app_role,
  target_user_ids uuid[],
  priority integer DEFAULT 0,
  style text DEFAULT 'info' CHECK (style IN ('info', 'warning', 'success', 'announcement'))
);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Dismissals table
CREATE TABLE announcement_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid REFERENCES announcements(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  dismissed_at timestamptz DEFAULT now(),
  acknowledged boolean DEFAULT false,
  UNIQUE(announcement_id, user_id)
);

ALTER TABLE announcement_dismissals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for announcements
CREATE POLICY "Super admins can manage all announcements"
  ON announcements FOR ALL
  USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Authorized creators can insert announcements"
  ON announcements FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'super_admin') OR
    has_role(auth.uid(), 'contractor') OR
    has_role(auth.uid(), 'sub_contractor') OR
    has_role(auth.uid(), 'quality_assurance_manager')
  );

CREATE POLICY "Users can view targeted active announcements"
  ON announcements FOR SELECT
  USING (
    is_active = true AND
    (scheduled_at IS NULL OR scheduled_at <= now()) AND
    (expires_at IS NULL OR expires_at > now()) AND
    (
      target_type = 'all' OR
      (target_type = 'contractor' AND target_contractor_id IN (
        SELECT contractor_id FROM profiles WHERE id = auth.uid()
        UNION
        SELECT active_contractor_id FROM profiles WHERE id = auth.uid()
      )) OR
      (target_type = 'role' AND target_role IN (
        SELECT role FROM user_roles WHERE user_id = auth.uid()
      )) OR
      (target_type = 'user' AND auth.uid() = ANY(target_user_ids))
    )
  );

CREATE POLICY "Creators can manage own announcements"
  ON announcements FOR UPDATE
  USING (created_by = auth.uid());

-- RLS Policies for dismissals
CREATE POLICY "Users can insert own dismissals"
  ON announcement_dismissals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own dismissals"
  ON announcement_dismissals FOR SELECT
  USING (auth.uid() = user_id);
```

---

## Implementation Sequence

1. **Database Migration** - Create tables and RLS policies
2. **Feature 1** - Update ManualInvoiceEntryDialog with editable total
3. **Create useAnnouncements hook** - Data fetching layer
4. **Create AnnouncementModal** - Display component
5. **Create AnnouncementProvider** - Display logic
6. **Integrate into Layout** - Provider wrapper
7. **Create CreateAnnouncementDialog** - Admin creation UI
8. **Create NoticeBoard page** - History viewing
9. **Add route and navigation** - App.tsx and nav updates
10. **Update NotificationBell** - Add announcement type
11. **Push notification integration** - Trigger on new announcements
