export interface User {
    id: string;
    email?: string;
    role?: string;
    name: string;
    avatar: string;
    bio: string;
    trustScore: number;
    verified: boolean;
    isEmailVerified: boolean;
    lat: number;
    lng: number;
    location?: {
        lat: number;
        lng: number;
    } | null;
    quietHoursStart?: string;
    quietHoursEnd?: string;
    distanceLimit: number;
    quietDays: number[];
    timezone?: string;
    createdAt?: number;
    deletionRequestedAt?: number | null;
}

export interface Pulse {
    id: string;
    userId: string;
    userName: string;
    userAvatar: string;
    type: 'update' | 'emergency' | 'skill' | 'item' | 'pet' | 'need';
    content: string;
    timestamp: number;
    lat: number;
    lng: number;
    verified: boolean;
    confirmations: number;
    urgencyLevel?: number;
    isEmergency?: boolean;
    isSolved?: boolean;
    distance?: number;
    requiredSkills?: string[];
}

export interface ResourceCatalogEntry {
    value: string;
    type: 'item' | 'skill';
}

export interface HeroMatchUser {
    id: string;
    displayName: string | null;
    matchedResources: string[];
    suppressedByQuietHours: boolean;
}

export type PulseInteractionStatus = 'accepted' | 'successful';

export interface PulseInteraction {
    id: string;
    pulseId: string;
    authorId: string;
    helperId: string;
    helperName: string;
    status: PulseInteractionStatus;
    acceptedAt: number;
    confirmedAt: number | null;
    trustAwarded: number;
}

export interface AuthorPulseRequest extends Pulse {
    acceptedCount: number;
    successfulCount: number;
}

export interface AcceptedInteraction {
    interaction: PulseInteraction;
    pulse: {
        id: string;
        content: string;
        type: Pulse['type'];
        timestamp: number;
        urgencyLevel: number;
        isSolved?: boolean;
    };
    author: {
        id: string;
        name: string;
    };
}

export interface WeatherData {
    temp: number;
    description: string;
    icon: string;
    severe: boolean;
    warning?: string;
}

export interface ChatMessageReply {
    id: string;
    senderId: string;
    senderName: string;
    snippet: string;
    isUnavailable: boolean;
}

export interface ChatMessage {
    id: string;
    senderId: string;
    senderName: string;
    content: string;
    isEdited?: boolean;
    type?: 'text' | 'notice';
    replyToId?: string | null;
    replyTo?: ChatMessageReply | null;
    timestamp: number;
}

export interface ChatThread {
    id: string;
    participants: string[];
    participantNames: string[];
    participantRoles?: Record<string, Array<'owner' | 'admin'>>;
    ownerId?: string | null;
    isGroup: boolean;
    name?: string;
    lastMessage?: ChatMessage;
    messages: ChatMessage[];
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
    createdAt?: number;
}

export interface AdminFlag {
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

export interface AdminOverview {
    totalUsers: number;
    adminUsers: number;
    modUsers: number;
    verifiedUsers: number;
    totalPulses: number;
    verifiedPulses: number;
    totalLibraryItems: number;
    availableLibraryItems: number;
}
