-- ========================================================
-- CLEANUP MIGRATION: Remove duplicate typo account bay3@lantrailers.com
-- ========================================================

-- Delete profile associated with the typo email
DELETE FROM public.profiles 
WHERE id IN (
  SELECT id FROM auth.users WHERE lower(email) = 'bay3@lantrailers.com'
);

-- Delete user from auth.users
DELETE FROM auth.users 
WHERE lower(email) = 'bay3@lantrailers.com';
