import { create } from 'zustand';

interface ActivityState {
  activityId: string;
  activity: string;
  skillLevel: string;
  emoji: string;
  forumLastSeenVersion: number;
  
  setActivity: (params: {
    activityId: string;
    activity: string;
    skillLevel: string;
    emoji: string;
  }) => void;
  touchForumLastSeen: () => void;
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  activityId: '',
  activity: '',
  skillLevel: '',
  emoji: '',
  forumLastSeenVersion: 0,

  setActivity: (params) => {
    const current = get();

    if (
      current.activityId === params.activityId &&
      current.activity === params.activity &&
      current.skillLevel === params.skillLevel &&
      current.emoji === params.emoji
    ) {
      return;
    }

    set(params);
  },
  touchForumLastSeen: () => {
    set((state) => ({ forumLastSeenVersion: state.forumLastSeenVersion + 1 }));
  },
}));
