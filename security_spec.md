# MideoCode Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **PII Isolation**: Email addresses and phone numbers live strictly in `/users/{userId}` (owner/admin read-only). Public leaderboards and community cards read only `/publicProfiles/{userId}`, which contains zero PII.
2. **No Self-Assigned Privileges**: Users cannot create or update `/users/{userId}` with `role != 'member'` unless they are already an authorized admin (`isAdmin()`).
3. **Strict Ownership**: User-owned resources (`bookmarks`, `notes`, `projects`, `playgrounds`, `challengeAttempts`, `xpTransactions`, `achievements`, `notifications`, `aiConversations`, `userSettings`, `userProgress`, `userCareerProgress`) enforce `request.auth.uid == ownerId/userId` on both document writes and `allow list` queries (`resource.data.userId == request.auth.uid` or `resource.data.ownerId == request.auth.uid`).
4. **Master Gate Subcollections**: `/projects/{projectId}/files/{fileId}` and `/projects/{projectId}/versions/{versionId}` verify parent project ownership via `get()` on `/projects/{projectId}`. `/communityPosts/{postId}/comments/{commentId}` verifies parent post existence and visibility via `get()`.
5. **Private-by-Default Sharing**: Projects and Playgrounds require explicit `visibility == 'public'` before non-owners can read them; private records are strictly denied to non-owners.
6. **Temporal Integrity**: All `createdAt` and `updatedAt` fields must equal `request.time` on creation/update; `createdAt` and owner IDs are immutable after creation.
7. **Idempotent Bounded XP**: `/xpTransactions/{txId}` enforces `amount >= 5 && amount <= 250` and immutable records (no updates/deletes) so clients cannot farm unlimited XP.

8. **Mandatory Quality Gate Enforcement**: `/missions/{missionId}` rejects creating or updating `status == 'published'` unless `qualityStatus == 'approved'`.
9. **Custom Mission Reward Isolation**: `/xpTransactions/{txId}` forbids official XP minting for custom missions (`sourceId` prefixed `custom_` or `mission-custom`), keeping `/customMissions` strictly practice-only.
10. **Team Collaboration RBAC**: `/missionTeams/{teamId}` verifies `memberRoles[uid] in ['owner', 'editor']` for workspace writes (`viewer` is strictly read-only) and requires an authentic matching `/missionTeamInvites/{teamId}_{uid}` document to join.
11. **Anti-Duplicate Quality Ratings**: `/missionRatings/{ratingId}` enforces deterministic `${missionId}_${uid}` IDs and bounded 1..5 star ratings.
12. **Shared Project Collaboration RBAC**: `/projects/{projectId}`, `/projects/{projectId}/files/{fileId}`, `/projects/{projectId}/versions/{versionId}`, and `/projects/{projectId}/comments/{commentId}` enforce `owner` / `editor` / `viewer` permissions in `firestore.rules`; `viewer` is strictly read-only, `editor` cannot change project visibility/collaborators/roles or delete the project/snapshots, and joining requires a verified `/projectInvitations/{projectId}_{emailSlug}` matching `request.auth.token.email`.
13. **Version Snapshot Integrity**: `/projects/{projectId}/versions/{versionId}` and `/architectures/{archId}/versions/{versionId}` prevent mutation of historical snapshot payloads (`snapshot`, `versionNumber`, `label`, `createdAt`).
14. **Private Architecture & TestLab Isolation**: `/architectures/{archId}`, `/testSuites/{suiteId}`, and `/testRuns/{runId}` restrict mutations to authorized owners/editors and enforce immutable `TestRunSession` records.
15. **Personal Developer Insights Privacy**: `/activityEvents/{eventId}` is strictly scoped to `request.auth.uid == userId` on both document access and list queries (plus admin audit if needed) and supports owner self-deletion for privacy control.

## 2. The "Dirty Dozen" + Advanced Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated Profile Read**: Anonymous client attempts `get(/users/user_1)`.
2. **Cross-User PII Read**: Authenticated `user_2` attempts `get(/users/user_1)`.
3. **Self-Admin Privilege Escalation**: Authenticated `user_1` creates `/users/user_1` with `role: "admin"`.
4. **Shadow Field Injection**: Authenticated `user_1` writes `/projects/proj_1` with extra ghost field `isFeaturedOfficial: true`.
5. **Fake Email Admin Spoof**: Client with unverified email token attempts admin operation on `/adminAuditLogs/log_1`.
6. **List Scraping Without Owner Filter**: Authenticated `user_2` runs unfiltered `list` on `/notes` or `/aiConversations`.
7. **Private Project Exfiltration**: Authenticated `user_2` attempts `get(/projects/private_proj_1/files/file_1)`.
8. **ID Poisoning**: Authenticated `user_1` attempts to create `/bookmarks/${'a'.repeat(500)}`.
9. **Client Timestamp Forgery**: Authenticated `user_1` creates `/notes/note_1` with backdated `createdAt` instead of `request.time`.
10. **Owner Hijack on Update**: Authenticated `user_1` updates `/projects/proj_1` attempting to change `ownerId` to `user_2`.
11. **XP Exploitation**: Authenticated `user_1` creates `/xpTransactions/tx_99` with `amount: 999999`.
12. **Comment on Non-Existent Post**: Authenticated `user_1` creates `/communityPosts/ghost_post/comments/c_1`.
13. **Non-Admin Mission Publishing**: Authenticated `user_1` (member) attempts to create or publish `/missions/m_fake`.
14. **Immutable Submission Tampering**: Mission author or `user_1` attempts to update `/missionSubmissions/sub_1` or `/missionEvaluations/eval_1`.
15. **Completed Attempt Rewind**: Authenticated `user_1` attempts to reset `status` from `completed` back to `in_progress` on `/missionAttempts/att_1` to farm rewards.
16. **Bypassing Mission Quality Gate**: Admin attempts to set `status: 'published'` on `/missions/m_draft` while `qualityStatus: 'testing'` or `'draft'`.
17. **Custom Mission Official XP Spoof**: Authenticated `user_1` attempts to create `/xpTransactions/tx_custom` with `sourceType: 'mission'` and `sourceId: 'custom_my_mission'`.
18. **Team Viewer File Mutation**: Authenticated `user_2` with role `'viewer'` attempts to modify `files` in `/missionTeams/team_1`.
19. **Non-Admin Adaptive Config Mutation**: Authenticated `user_1` attempts to update `/platformConfig/missionAdaptiveConfig`.
20. **Duplicate / Cross-User Rating Tampering**: Authenticated `user_2` attempts to write `/missionRatings/m1_user_1` (`ratingId != missionId + '_' + uid`).
21. **Project Collaborator Viewer Write Escalation**: Authenticated `user_2` with role `'viewer'` attempts to update `/projects/proj_1/files/file_1` or post a comment at `/projects/proj_1/comments/c_1`.
22. **Project Editor Privilege Escalation**: Authenticated `user_2` with role `'editor'` attempts to modify `collaboratorRoles` or delete `/projects/proj_1`.
23. **Forged Project Invitation Acceptance**: Authenticated `user_3` whose token email does not match `inviteeEmail` attempts to accept `/projectInvitations/proj_1_alex_example_com` or add themselves to `collaboratorIds`.
24. **Cross-User Developer Insights Read**: Authenticated `user_2` attempts `get` or `list` on `/activityEvents` belonging to `user_1`.
25. **Immutable TestRun Tampering**: Authenticated `user_1` attempts to `update` `/testRuns/run_1` to alter `passedTests`.


