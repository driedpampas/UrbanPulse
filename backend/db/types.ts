export interface Location {
    lat?: number | null;
    lng?: number | null;
}

export interface Timerange {
    start: string;
    end: string;
}

export const PULSE_TYPE_VALUES = ['update', 'emergency', 'skill', 'item', 'pet', 'need'] as const;

export type PulseType = (typeof PULSE_TYPE_VALUES)[number];

export interface PulseFeedItem {
    id: string;
    userId: string;
    userName: string;
    type: PulseType;
    content: string;
    timestamp: number;
    lat: number;
    lng: number;
    verified: boolean;
    confirmations: number;

    isEmergency: boolean;
    isSolved: boolean;
    requiredSkills: string[];
    userRole?: string;
    userTrustScore?: number;
}

export interface HeroMatchUser {
    id: string;
    displayName: string | null;
    matchedResources: string[];
    suppressedByQuietHours: boolean;
}

export type InteractionStatus = 'accepted' | 'successful';

export interface PulseInteraction {
    id: string;
    pulseId: string;
    authorId: string;
    helperId: string;
    helperName: string;
    status: InteractionStatus;
    acceptedAt: number;
    confirmedAt: number | null;
    trustAwarded: number;
}

export interface AuthorPulseRequest extends PulseFeedItem {
    acceptedCount: number;
    successfulCount: number;
}

export interface AcceptedInteraction {
    interaction: PulseInteraction;
    pulse: {
        id: string;
        content: string;
        type: PulseType;
        timestamp: number;

        isSolved: boolean;
    };
    author: {
        id: string;
        name: string;
    };
}

export interface MessageReply {
    id: string;
    senderId: string;
    senderName: string;
    snippet: string;
    isUnavailable: boolean;
}

export interface Message {
    id: string;
    threadId: string;
    senderId: string;
    content: string;
    isEdited: boolean;
    messageType: 'text' | 'notice';
    replyToId: string | null;
    replyTo: MessageReply | null;
    timestamp: number;
}

export type DeleteMessageScope = 'me' | 'everyone';

export type EditMessageResult =
    | { success: true; message: Message }
    | { success: false; reason: 'not_found' | 'forbidden' };

export type ChatParticipantRole = 'owner' | 'admin';

export interface Chat {
    id: string;
    participants: {
        userId: string;
    }[];
    participantRoles: Record<string, ChatParticipantRole[]>;
    ownerId: string | null;
    name: string | null;
    isGroup: boolean;
    timestamp: number;
}

export interface ChatSummary {
    id: string;
    participants: {
        userId: string;
        displayName: string | null;
        roles: ChatParticipantRole[];
    }[];
    ownerId: string | null;
    name: string | null;
    isGroup: boolean;
    timestamp: number;
}

export interface LibraryItem {
    id: string;
    userId: string;
    userName: string;
    type: 'item' | 'skill';
    title: string;
    description: string;
    tags: string[];
    available: boolean;
    createdAt: number;
}

export interface ResourceCatalogEntry {
    value: string;
    type: 'item' | 'skill';
}

export interface UpdateLibraryItemParams {
    title?: string;
    description?: string;
    tags?: string[];
    isAvailable?: boolean;
}

export interface User {
    id: string;
    email?: string | null;
    role?: string;
    passwordHash?: string | null;
    isEmailVerified?: boolean;
    verificationToken?: string | null;
    passwordResetToken?: string | null;
    passwordResetExpires?: Date | null;
    displayName?: string | null;
    radius?: number | null;
    location?: Location | null;
    quietHours?: Timerange[] | null;
    quietDays?: number[] | null;
    timezone?: string | null;
    trustScore?: number | null;
    bio?: string | null;
    profilePictureFilename?: string | null;
    profilePictureMimeType?: string | null;
    profilePictureSizeBytes?: number | null;
    profilePictureUpdatedAt?: Date | null;
    verified?: boolean;
    createdAt?: Date;
    deletionRequestedAt?: number | null;
}

export interface UserSearchParams {
    id: string | null;
    min_trust: string | null;
    max_trust: string | null;
    anySkillRes: string | null;
    skillsAndResources: string[] | null;
    created_before: string | null;
    created_after: string | null;
    email: string | null;
    displayName: string | null;
    role: string | null;
    radius: string | null;
    location: {
        lat: string | null;
        lng: string | null;
    } | null;
    availableHours: string[] | null;
    availableDays: string[] | null;
    bio: string | null;
    verified: string | null;
}

export interface PulseCreateParams {
    authorId: string;
    content: string;
    location: Location;
    type: string;
    isEmergency?: boolean;

    requiredSkills: string[];
}

export type PulseRow = {
    id: string;
    userId?: string;
    author_id?: string;
    userName?: string | null;
    content?: string | null;
    timestamp?: number | string | Date;
    lat?: number | string | null;
    lng?: number | string | null;
    verified?: boolean | null;
    confirmations?: number | string | null;
    userRole?: string | null;
    userTrustScore?: number | string | null;


    isEmergency?: boolean | null;
    is_emergency?: boolean | null;
    isSolved?: boolean | null;
    is_solved?: boolean | null;
    type?: string | null;
    required_skills?: string[] | null;
    accepted_count?: number | string | null;
    successful_count?: number | string | null;
};

export type HeroCandidateRow = {
    id: string;
    display_name?: string | null;
    quiet_hours?: Timerange[] | null;
    quiet_days?: number[] | null;
    timezone?: string | null;
};

export type UserResourceRow = {
    author_id: string;
    title: string;
    tags: string[] | null;
};

export type PulseInteractionRow = {
    id: string;
    pulse_id: string;
    author_id: string;
    helper_id: string;
    helper_name?: string | null;
    status: string;
    accepted_at: number | string | Date;
    confirmed_at: number | string | Date | null;
    trust_awarded?: number | string | null;
};

export type AcceptedInteractionRow = PulseInteractionRow & {
    pulse_content: string;
    pulse_type: string;
    pulse_timestamp: number | string | Date;

    pulse_is_solved: boolean | null;
    author_name?: string | null;
};

export type UserRow = {
    id: string;
    email?: string | null;
    role?: string;
    is_email_verified?: boolean | null;
    verification_token?: string | null;
    password_reset_token?: string | null;
    password_reset_expires?: Date | string | number | null;
    created_at?: Date | string | number;
    trust_score?: number | string | null;
    display_name?: string | null;
    is_verified_neighbor?: boolean | null;
    distance_limit_meters?: number | string | null;
    lat?: number | string | null;
    lng?: number | string | null;
    quiet_hours?: Timerange[] | null;
    quiet_days?: number[] | null;
    timezone?: string | null;
    bio?: string | null;
    profile_picture_filename?: string | null;
    profile_picture_mime_type?: string | null;
    profile_picture_size_bytes?: number | null;
    profile_picture_updated_at?: Date | string | number | null;
    deletion_requested_at?: Date | string | number | null;
};

export type MessageRow = {
    id: string;
    thread_id: string;
    sender_id: string;
    content: string;
    is_edited?: boolean | null;
    message_type?: string | null;
    reply_to_id?: string | null;
    reply_to_sender_id?: string | null;
    reply_to_sender_name?: string | null;
    reply_to_snippet?: string | null;
    reply_to_unavailable?: boolean | null;
    timestamp: number | string | Date;
};

export type ChatParticipantRow = {
    thread_id: string;
    user_id: string;
    created_at: number | string | Date;
    roles?: string[];
};

export type ChatThreadRow = {
    id: string;
    is_group: boolean;
    timestamp: number | string | Date;
    owner_id?: string | null;
    name?: string | null;
};

export type ChatRoleRow = {
    thread_id: string;
    user_id: string;
    role: string;
};

export type LibraryItemRow = {
    id: string;
    author_id: string;
    userName?: string | null;
    item_type: string;
    title: string;
    description: string | null;
    tags: string[] | null;
    is_available: boolean;
    created_at: Date | string | number;
};

export type LibraryResourceRow = {
    item_type: string;
    title: string;
    tags: string[] | null;
};

export type ChatSummaryRow = {
    id: string;
    is_group: boolean;
    timestamp: number | string | Date;
    name: string | null;
    participants:
        | Array<{
              userId: string;
              displayName: string | null;
              roles: string[];
          }>
        | unknown;
    owner_id: string | null;
};

export interface Report {
    id: string;
    targetId: string;
    targetType: 'pulse' | 'user' | 'message';
    reason: string;
    reportedBy: string;
    timestamp: number;
    status: 'pending' | 'resolved' | 'dismissed';
    content: string;
}

export type MessageReportStatus = 'pending' | 'reviewed' | 'action_taken';
export type MessageReportAction = 'ban_user' | 'delete_message' | 'dismiss';

export interface AdminMessageReport {
    id: string;
    messageId: string;
    messageContent: string;
    reason: string;
    status: MessageReportStatus;
    timestamp: number;
    reporter: {
        id: string;
        name: string;
    };
    offender: {
        id: string;
        name: string;
    };
}

export interface ScheduledUserDeletion {
    user: User;
    requestedAt: number;
    purgeAt: number;
}

export type ReportRow = {
    id: string;
    target_id: string;
    target_type: string;
    reason: string;
    reported_by: string;
    created_at: number | string | Date;
    status: string;
    content: string;
};

export type AdminMessageReportRow = {
    id: string;
    message_id: string;
    message_content: string;
    reason: string;
    status: string;
    created_at: number | string | Date;
    reporter_id: string;
    reporter_name: string;
    offender_id: string;
    offender_name: string;
};
