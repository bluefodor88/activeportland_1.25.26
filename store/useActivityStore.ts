import { create } from 'zustand';

interface ActivityState {
  activityId: string;
  activity: string;
  skillLevel: string;
  emoji: string;
  
  setActivity: (params: {
    activityId: string;
    activity: string;
    skillLevel: string;
    emoji: string;
  }) => void;
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  activityId: '',
  activity: '',
  skillLevel: '',
  emoji: '',

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
}));