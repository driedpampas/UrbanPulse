import type {
    AdminFlag,
    ChatMessage,
    ChatThread,
    LibraryItem,
    PetMatch,
    Pulse,
    User,
    WeatherData,
} from './types';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const AVATARS = [
    'https://api.dicebear.com/9.x/adventurer/svg?seed=Felix',
    'https://api.dicebear.com/9.x/adventurer/svg?seed=Aneka',
    'https://api.dicebear.com/9.x/adventurer/svg?seed=Leo',
    'https://api.dicebear.com/9.x/adventurer/svg?seed=Maria',
    'https://api.dicebear.com/9.x/adventurer/svg?seed=Sam',
    'https://api.dicebear.com/9.x/adventurer/svg?seed=Zoe',
];

let currentUser: User = {
    id: 'me',
    name: 'Alex Rivera',
    avatar: AVATARS[0],
    bio: 'Community builder & urban gardener 🌱',
    skills: ['Gardening', 'Dog Walking', 'First Aid'],
    trustScore: 87,
    verified: true,
    lat: 40.7128,
    lng: -74.006,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
    distanceLimitKm: 2,
};

const mockUsers: User[] = [
    currentUser,
    {
        id: 'u2',
        name: 'Priya Sharma',
        avatar: AVATARS[1],
        bio: 'Yoga instructor & book lover',
        skills: ['Yoga', 'Cooking', 'Tutoring'],
        trustScore: 94,
        verified: true,
        lat: 40.714,
        lng: -74.003,
        distanceLimitKm: 1,
    },
    {
        id: 'u3',
        name: 'Marcus Chen',
        avatar: AVATARS[2],
        bio: 'Handy with tools 🔧',
        skills: ['Plumbing', 'Carpentry', 'Electrical'],
        trustScore: 72,
        verified: false,
        lat: 40.711,
        lng: -74.009,
        distanceLimitKm: 3,
    },
    {
        id: 'u4',
        name: 'Lina Okafor',
        avatar: AVATARS[3],
        bio: 'Neighborhood watch captain',
        skills: ['First Aid', 'CPR', 'Security'],
        trustScore: 96,
        verified: true,
        lat: 40.715,
        lng: -74.001,
        distanceLimitKm: 5,
    },
    {
        id: 'u5',
        name: 'Sam Taylor',
        avatar: AVATARS[4],
        bio: 'Pet sitter extraordinaire 🐕',
        skills: ['Pet Care', 'Dog Walking'],
        trustScore: 65,
        verified: false,
        lat: 40.71,
        lng: -74.008,
        distanceLimitKm: 2,
    },
    {
        id: 'u6',
        name: 'Zoe Martinez',
        avatar: AVATARS[5],
        bio: 'Chef & community kitchen volunteer',
        skills: ['Cooking', 'Event Planning'],
        trustScore: 88,
        verified: true,
        lat: 40.716,
        lng: -74.004,
        distanceLimitKm: 1,
    },
];

const mockPulses: Pulse[] = [
    {
        id: 'p1',
        userId: 'u4',
        userName: 'Lina Okafor',
        userAvatar: AVATARS[3],
        type: 'emergency',
        content: '⚠️ Water main break on 5th Ave — avoid the area! Crews on the way.',
        timestamp: Date.now() - 120000,
        lat: 40.714,
        lng: -74.005,
        verified: true,
        confirmations: 5,
    },
    {
        id: 'p2',
        userId: 'u2',
        userName: 'Priya Sharma',
        userAvatar: AVATARS[1],
        type: 'skill',
        content: 'Free yoga class this Saturday in the park! All levels welcome 🧘',
        timestamp: Date.now() - 300000,
        lat: 40.713,
        lng: -74.002,
        verified: false,
        confirmations: 0,
    },
    {
        id: 'p3',
        userId: 'u3',
        userName: 'Marcus Chen',
        userAvatar: AVATARS[2],
        type: 'item',
        content: 'Lending out my power drill this weekend. DM if you need it!',
        timestamp: Date.now() - 600000,
        lat: 40.711,
        lng: -74.008,
        verified: false,
        confirmations: 0,
    },
    {
        id: 'p4',
        userId: 'u5',
        userName: 'Sam Taylor',
        userAvatar: AVATARS[4],
        type: 'pet',
        content:
            '🐕 Found a golden retriever near Central Park entrance — no collar. Please share!',
        timestamp: Date.now() - 900000,
        lat: 40.71,
        lng: -74.007,
        verified: false,
        confirmations: 2,
    },
    {
        id: 'p5',
        userId: 'u6',
        userName: 'Zoe Martinez',
        userAvatar: AVATARS[5],
        type: 'update',
        content: 'Community potluck next Friday! Sign up sheet at the community board.',
        timestamp: Date.now() - 1200000,
        lat: 40.716,
        lng: -74.004,
        verified: false,
        confirmations: 1,
    },
    {
        id: 'p6',
        userId: 'me',
        userName: 'Alex Rivera',
        userAvatar: AVATARS[0],
        type: 'need',
        content:
            'Looking for someone to help carry groceries for elderly neighbor on 3rd floor. Any heroes? 💪',
        timestamp: Date.now() - 1500000,
        lat: 40.7128,
        lng: -74.006,
        verified: false,
        confirmations: 0,
    },
    {
        id: 'p7',
        userId: 'u2',
        userName: 'Priya Sharma',
        userAvatar: AVATARS[1],
        type: 'update',
        content: 'Stray tabby cat spotted near the deli on Oak St — looks friendly but scared. 🐱',
        timestamp: Date.now() - 2000000,
        lat: 40.712,
        lng: -74.003,
        verified: true,
        confirmations: 4,
    },
];

const mockLibrary: LibraryItem[] = [
    {
        id: 'l1',
        userId: 'u3',
        userName: 'Marcus Chen',
        type: 'item',
        title: 'Power Drill',
        description: 'DeWalt 20V cordless. Available weekends.',
        tags: ['Tools', 'DIY'],
        available: true,
    },
    {
        id: 'l2',
        userId: 'u2',
        userName: 'Priya Sharma',
        type: 'skill',
        title: 'Yoga Instruction',
        description: 'Certified instructor — happy to do private or group sessions.',
        tags: ['Fitness', 'Wellness'],
        available: true,
    },
    {
        id: 'l3',
        userId: 'u6',
        userName: 'Zoe Martinez',
        type: 'skill',
        title: 'Meal Prep & Cooking',
        description: 'Can cook meals for elderly neighbors or teach basic recipes.',
        tags: ['Cooking', 'Community'],
        available: true,
    },
    {
        id: 'l4',
        userId: 'u5',
        userName: 'Sam Taylor',
        type: 'skill',
        title: 'Dog Walking',
        description: 'Available mornings and evenings. Experience with large breeds.',
        tags: ['Pets', 'Exercise'],
        available: false,
    },
    {
        id: 'l5',
        userId: 'me',
        userName: 'Alex Rivera',
        type: 'item',
        title: 'Garden Tool Set',
        description: 'Shovel, rake, pruning shears. Perfect for small garden plots.',
        tags: ['Garden', 'Tools'],
        available: true,
    },
    {
        id: 'l6',
        userId: 'u4',
        userName: 'Lina Okafor',
        type: 'item',
        title: 'First Aid Kit (Pro)',
        description: 'Full professional first aid kit. Available for emergencies.',
        tags: ['Safety', 'Medical'],
        available: true,
    },
];

const mockChats: ChatThread[] = [
    {
        id: 'c1',
        participants: ['me', 'u2'],
        participantNames: ['Alex Rivera', 'Priya Sharma'],
        isGroup: false,
        messages: [
            {
                id: 'm1',
                senderId: 'u2',
                senderName: 'Priya Sharma',
                content: 'Hey! Are you coming to the yoga session?',
                timestamp: Date.now() - 3600000,
            },
            {
                id: 'm2',
                senderId: 'me',
                senderName: 'Alex Rivera',
                content: 'Absolutely! What should I bring?',
                timestamp: Date.now() - 3500000,
            },
            {
                id: 'm3',
                senderId: 'u2',
                senderName: 'Priya Sharma',
                content: 'Just a mat and water. See you there! 🧘',
                timestamp: Date.now() - 3400000,
            },
        ],
    },
    {
        id: 'c2',
        participants: ['me', 'u3', 'u4'],
        participantNames: ['Alex Rivera', 'Marcus Chen', 'Lina Okafor'],
        isGroup: true,
        name: 'Block Watch Team',
        messages: [
            {
                id: 'm4',
                senderId: 'u4',
                senderName: 'Lina Okafor',
                content: 'Water main is being fixed, ETA 2hrs',
                timestamp: Date.now() - 60000,
            },
            {
                id: 'm5',
                senderId: 'u3',
                senderName: 'Marcus Chen',
                content: 'I can help redirect foot traffic if needed',
                timestamp: Date.now() - 30000,
            },
        ],
    },
];

const mockPetMatches: PetMatch[] = [
    {
        id: 'pet1',
        reportType: 'lost',
        species: 'Dog',
        breed: 'Golden Retriever',
        color: 'Gold',
        markings: 'White patch on chest, red collar',
        photo: '',
        location: 'Central Park entrance',
        timestamp: Date.now() - 7200000,
    },
    {
        id: 'pet2',
        reportType: 'found',
        species: 'Dog',
        breed: 'Golden Retriever',
        color: 'Gold/Cream',
        markings: 'Light patch on chest, no collar',
        photo: '',
        location: 'Near Oak St deli',
        timestamp: Date.now() - 3600000,
        matchConfidence: 91,
        matchedWith: 'pet1',
    },
    {
        id: 'pet3',
        reportType: 'lost',
        species: 'Cat',
        breed: 'Tabby',
        color: 'Orange/Brown',
        markings: 'Striped, green eyes, notched left ear',
        photo: '',
        location: 'Elm Street apartments',
        timestamp: Date.now() - 86400000,
    },
    {
        id: 'pet4',
        reportType: 'found',
        species: 'Cat',
        breed: 'Tabby',
        color: 'Brown/Orange',
        markings: 'Striped pattern, green eyes',
        photo: '',
        location: 'Oak St deli area',
        timestamp: Date.now() - 2000000,
        matchConfidence: 78,
        matchedWith: 'pet3',
    },
];

const mockFlags: AdminFlag[] = [
    {
        id: 'f1',
        targetId: 'p3',
        targetType: 'pulse',
        reason: 'Suspicious listing',
        reportedBy: 'u4',
        timestamp: Date.now() - 1800000,
        status: 'pending',
        content: 'Lending out my power drill this weekend.',
    },
    {
        id: 'f2',
        targetId: 'u5',
        targetType: 'user',
        reason: 'Unverified identity',
        reportedBy: 'u2',
        timestamp: Date.now() - 7200000,
        status: 'pending',
        content: 'User Sam Taylor has not completed identity verification.',
    },
    {
        id: 'f3',
        targetId: 'p5',
        targetType: 'pulse',
        reason: 'Duplicate post',
        reportedBy: 'u3',
        timestamp: Date.now() - 3600000,
        status: 'resolved',
        content: 'Community potluck next Friday!',
    },
];

export async function fetchCurrentUser(): Promise<User> {
    await delay(300);
    return { ...currentUser };
}

export async function updateProfile(updates: Partial<User>): Promise<User> {
    await delay(400);
    currentUser = { ...currentUser, ...updates };
    return { ...currentUser };
}

export async function deleteAccount(): Promise<void> {
    await delay(500);
}

export async function fetchPulses(): Promise<Pulse[]> {
    await delay(400);
    return [...mockPulses];
}

export async function postPulse(
    pulse: Omit<Pulse, 'id' | 'timestamp' | 'verified' | 'confirmations'>
): Promise<Pulse> {
    await delay(300);
    const newPulse: Pulse = {
        ...pulse,
        id: 'p' + Date.now(),
        timestamp: Date.now(),
        verified: false,
        confirmations: 0,
    };
    mockPulses.unshift(newPulse);
    return newPulse;
}

export async function fetchWeather(): Promise<WeatherData> {
    await delay(200);
    const isSevere = Math.random() > 0.5;
    return isSevere
        ? {
              temp: 35,
              description: 'Thunderstorm Warning',
              icon: '⛈️',
              severe: true,
              warning: 'Severe thunderstorm warning issued until 8 PM. Seek shelter immediately.',
          }
        : { temp: 22, description: 'Partly Cloudy', icon: '⛅', severe: false };
}

export async function fetchLibrary(): Promise<LibraryItem[]> {
    await delay(350);
    return [...mockLibrary];
}

export async function postLibraryItem(item: Omit<LibraryItem, 'id'>): Promise<LibraryItem> {
    await delay(300);
    const newItem: LibraryItem = { ...item, id: 'l' + Date.now() };
    mockLibrary.push(newItem);
    return newItem;
}

export async function fetchChats(): Promise<ChatThread[]> {
    await delay(300);
    return mockChats.map((chat) => {
        const messages = chat.messages.map((message) => ({ ...message }));
        const lastMessage = messages[messages.length - 1];

        return {
            ...chat,
            messages,
            lastMessage: lastMessage ? { ...lastMessage } : undefined,
        };
    });
}

export async function sendMessage(threadId: string, content: string): Promise<ChatMessage> {
    await delay(200);
    const msg: ChatMessage = {
        id: 'm' + Date.now(),
        senderId: 'me',
        senderName: 'Alex Rivera',
        content,
        timestamp: Date.now(),
    };
    const thread = mockChats.find((c) => c.id === threadId);
    if (thread) thread.messages.push(msg);
    return msg;
}

export async function fetchPetMatches(): Promise<PetMatch[]> {
    await delay(400);
    return [...mockPetMatches];
}

export async function fetchFlags(): Promise<AdminFlag[]> {
    await delay(300);
    return [...mockFlags];
}

export async function resolveFlag(id: string, status: 'resolved' | 'dismissed'): Promise<void> {
    await delay(200);
    const flag = mockFlags.find((f) => f.id === id);
    if (flag) flag.status = status;
}

export async function fetchUsers(): Promise<User[]> {
    await delay(300);
    return [...mockUsers];
}

export async function login(_email: string, _password: string): Promise<User> {
    await delay(500);
    return { ...currentUser };
}

export async function register(_name: string, _email: string, _password: string): Promise<User> {
    await delay(600);
    return { ...currentUser };
}

type WSHandler = (pulse: Pulse) => void;
const wsHandlers: WSHandler[] = [];

const WS_EVENTS: Array<Omit<Pulse, 'id' | 'timestamp'>> = [
    {
        userId: 'u4',
        userName: 'Lina Okafor',
        userAvatar: AVATARS[3],
        type: 'emergency',
        content: '🚨 Gas leak reported on Maple Ave. Fire dept dispatched!',
        lat: 40.713,
        lng: -74.004,
        verified: true,
        confirmations: 3,
    },
    {
        userId: 'u6',
        userName: 'Zoe Martinez',
        userAvatar: AVATARS[5],
        type: 'skill',
        content: '🍳 Free cooking class tomorrow — limited spots!',
        lat: 40.716,
        lng: -74.004,
        verified: false,
        confirmations: 0,
    },
    {
        userId: 'u3',
        userName: 'Marcus Chen',
        userAvatar: AVATARS[2],
        type: 'item',
        content: '🪜 Ladder available for borrowing today only!',
        lat: 40.711,
        lng: -74.009,
        verified: false,
        confirmations: 0,
    },
    {
        userId: 'u5',
        userName: 'Sam Taylor',
        userAvatar: AVATARS[4],
        type: 'need',
        content: "Anyone have jumper cables? Car won't start on Oak St 🚗",
        lat: 40.71,
        lng: -74.008,
        verified: false,
        confirmations: 0,
    },
];

let wsInterval: ReturnType<typeof setInterval> | null = null;

export function connectWebSocket(handler: WSHandler) {
    wsHandlers.push(handler);
    if (!wsInterval) {
        let idx = 0;
        wsInterval = setInterval(() => {
            const event = WS_EVENTS[idx % WS_EVENTS.length];
            const pulse: Pulse = { ...event, id: 'ws' + Date.now(), timestamp: Date.now() };
            for (const h of wsHandlers) h(pulse);
            idx++;
        }, 12000);
    }
}

export function disconnectWebSocket(handler: WSHandler) {
    const i = wsHandlers.indexOf(handler);
    if (i !== -1) wsHandlers.splice(i, 1);
    if (wsHandlers.length === 0 && wsInterval) {
        clearInterval(wsInterval);
        wsInterval = null;
    }
}
