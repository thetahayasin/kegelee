/**
 * Pre-seed data for Kegelee — hardcoded from database seeders.
 *
 * This is the bootstrap dataset. The app works immediately on first install
 * with zero network. When the sync engine runs, server data replaces this.
 */

export const SEED_EXERCISES = [
    { id: 1, slug: 'trembling', name: 'Trembling', description: 'Rapid short contractions that make the muscle "tremble" and build fast-twitch response.', instructions: 'Follow the circle: contract when it says "Contract & hold", release when it says "Relax".', contract_seconds: 0.7, relax_seconds: 0.4, hold_seconds: 0, min_duration: 18, max_duration: 40, is_active: true, full_hold: false, start_phase: 'relax', contract_glow_mode: 'at_once', relax_glow_mode: 'at_once', contract_label: 'Contract', relax_label: 'Relax', unlock_after_days: 0, sort_order: 0 },
    { id: 2, slug: 'holding', name: 'Holding', description: 'Contract and hold to build baseline endurance in the pelvic floor.', instructions: 'Follow the circle: contract when it says "Contract & hold", release when it says "Relax".', contract_seconds: 3, relax_seconds: 3, hold_seconds: 0, min_duration: 15, max_duration: 25, is_active: true, full_hold: true, start_phase: 'contract', contract_glow_mode: 'slowly', relax_glow_mode: 'slowly', contract_label: 'Contract & hold', relax_label: 'Relax', unlock_after_days: 0, sort_order: 1 },
    { id: 3, slug: 'front-clamp', name: 'Front Clamp', description: 'Focused contraction of the front pelvic floor muscles.', instructions: 'Follow the circle: contract when it says "Contract & hold", release when it says "Relax".', contract_seconds: 2.6, relax_seconds: 0.4, hold_seconds: 0, min_duration: 25, max_duration: 60, is_active: true, full_hold: false, start_phase: 'contract', contract_glow_mode: 'slowly', relax_glow_mode: 'slowly', contract_label: 'Contract & hold', relax_label: 'Relax', unlock_after_days: 1, sort_order: 2 },
    { id: 4, slug: 'reverse-clamp', name: 'Reverse Clamp', description: 'Engages the rear pelvic floor for balanced strength.', instructions: 'Follow the circle: contract when it says "Contract & hold", release when it says "Relax".', contract_seconds: 0.4, relax_seconds: 2.6, hold_seconds: 0.1, min_duration: 25, max_duration: 60, is_active: true, full_hold: false, start_phase: 'contract', contract_glow_mode: 'at_once', relax_glow_mode: 'slowly', contract_label: 'Contract & hold', relax_label: 'Relax', unlock_after_days: 3, sort_order: 3 },
    { id: 5, slug: 'flash', name: 'Flash', description: 'Very fast flicks to train explosive muscle response.', instructions: 'Follow the circle: contract when it says "Contract & hold", release when it says "Relax".', contract_seconds: 0.3, relax_seconds: 0.3, hold_seconds: 0, min_duration: 15, max_duration: 20, is_active: true, full_hold: false, start_phase: 'contract', contract_glow_mode: 'at_once', relax_glow_mode: 'at_once', contract_label: 'Contract & hold', relax_label: 'Relax', unlock_after_days: 5, sort_order: 4 },
    { id: 6, slug: 'steady-trembling', name: 'Steady Trembling', description: 'Sustained trembling contractions at a steady rhythm.', instructions: 'Follow the circle: contract when it says "Contract & hold", release when it says "Relax".', contract_seconds: 2.4, relax_seconds: 0.5, hold_seconds: 0, min_duration: 25, max_duration: 60, is_active: true, full_hold: false, start_phase: 'contract', contract_glow_mode: 'at_once', relax_glow_mode: 'slowly', contract_label: 'Contract Slowly', relax_label: 'Relax', unlock_after_days: 7, sort_order: 5 },
    { id: 7, slug: 'clamp', name: 'Clamp', description: 'A firm full contraction held under control.', instructions: 'Follow the circle: contract when it says "Contract & hold", release when it says "Relax".', contract_seconds: 3, relax_seconds: 3, hold_seconds: 0.3, min_duration: 30, max_duration: 70, is_active: true, full_hold: false, start_phase: 'contract', contract_glow_mode: 'slowly', relax_glow_mode: 'slowly', contract_label: 'Contract & hold', relax_label: 'Relax', unlock_after_days: 14, sort_order: 6 },
    { id: 8, slug: 'starter', name: 'Starter', description: 'A warm-up routine to prepare the pelvic floor for harder work.', instructions: 'Follow the circle: contract when it says "Contract & hold", release when it says "Relax".', contract_seconds: 2, relax_seconds: 1, hold_seconds: 0, min_duration: 30, max_duration: 120, is_active: true, full_hold: false, start_phase: 'contract', contract_glow_mode: 'slowly', relax_glow_mode: 'slowly', contract_label: 'Contract & hold', relax_label: 'Relax', unlock_after_days: 20, sort_order: 7 },
    { id: 9, slug: 'short-holding', name: 'Short Holding', description: 'Short, strong holds.', instructions: 'Follow the circle: contract when it says "Contract & hold", release when it says "Relax".', contract_seconds: 4, relax_seconds: 1, hold_seconds: 0, min_duration: 30, max_duration: 120, is_active: true, full_hold: false, start_phase: 'contract', contract_glow_mode: 'slowly', relax_glow_mode: 'slowly', contract_label: 'Contract & hold', relax_label: 'Relax', unlock_after_days: 36, sort_order: 8 },
    { id: 10, slug: 'waves', name: 'Waves', description: 'Wave-like contractions building and releasing tension.', instructions: 'Follow the circle: contract when it says "Contract & hold", release when it says "Relax".', contract_seconds: 3, relax_seconds: 2, hold_seconds: 0, min_duration: 30, max_duration: 120, is_active: true, full_hold: false, start_phase: 'contract', contract_glow_mode: 'slowly', relax_glow_mode: 'slowly', contract_label: 'Contract & hold', relax_label: 'Relax', unlock_after_days: 43, sort_order: 9 },
    { id: 11, slug: 'pulsation', name: 'Pulsation', description: 'Rhythmic pulses to improve muscle stamina and timing.', instructions: 'Follow the circle: contract when it says "Contract & hold", release when it says "Relax".', contract_seconds: 1, relax_seconds: 1, hold_seconds: 0, min_duration: 30, max_duration: 120, is_active: true, full_hold: false, start_phase: 'contract', contract_glow_mode: 'slowly', relax_glow_mode: 'slowly', contract_label: 'Contract & hold', relax_label: 'Relax', unlock_after_days: 50, sort_order: 10 },
    { id: 12, slug: 'push', name: 'Push', description: 'Push the contraction to its peak and hold firmly.', instructions: 'Follow the circle: contract when it says "Contract & hold", release when it says "Relax".', contract_seconds: 5, relax_seconds: 1, hold_seconds: 0, min_duration: 30, max_duration: 120, is_active: true, full_hold: false, start_phase: 'contract', contract_glow_mode: 'slowly', relax_glow_mode: 'slowly', contract_label: 'Contract & hold', relax_label: 'Relax', unlock_after_days: 57, sort_order: 11 },
    { id: 13, slug: 'upstairs', name: 'Upstairs', description: 'Step up the intensity in graduated contractions like climbing stairs.', instructions: 'Follow the circle: contract when it says "Contract & hold", release when it says "Relax".', contract_seconds: 2, relax_seconds: 1, hold_seconds: 0, min_duration: 30, max_duration: 120, is_active: true, full_hold: false, start_phase: 'contract', contract_glow_mode: 'slowly', relax_glow_mode: 'slowly', contract_label: 'Contract & hold', relax_label: 'Relax', unlock_after_days: 69, sort_order: 12 },
    { id: 14, slug: 'steady-clamp', name: 'Steady Clamp', description: 'Long, steady clamps that demand sustained control.', instructions: 'Follow the circle: contract when it says "Contract & hold", release when it says "Relax".', contract_seconds: 5, relax_seconds: 5, hold_seconds: 0, min_duration: 30, max_duration: 120, is_active: true, full_hold: false, start_phase: 'contract', contract_glow_mode: 'slowly', relax_glow_mode: 'slowly', contract_label: 'Contract & hold', relax_label: 'Relax', unlock_after_days: 79, sort_order: 13 },
    { id: 15, slug: 'downstairs', name: 'Downstairs', description: 'Graduated release contractions, descending in intensity.', instructions: 'Follow the circle: contract when it says "Contract & hold", release when it says "Relax".', contract_seconds: 2, relax_seconds: 1, hold_seconds: 0, min_duration: 30, max_duration: 120, is_active: true, full_hold: false, start_phase: 'contract', contract_glow_mode: 'slowly', relax_glow_mode: 'slowly', contract_label: 'Contract & hold', relax_label: 'Relax', unlock_after_days: 89, sort_order: 14 },
    { id: 16, slug: 'long-steady-clamp', name: 'Long Steady Clamp', description: 'Extended maximal holds for peak endurance.', instructions: 'Follow the circle: contract when it says "Contract & hold", release when it says "Relax".', contract_seconds: 10, relax_seconds: 5, hold_seconds: 0, min_duration: 30, max_duration: 120, is_active: true, full_hold: false, start_phase: 'contract', contract_glow_mode: 'slowly', relax_glow_mode: 'slowly', contract_label: 'Contract & hold', relax_label: 'Relax', unlock_after_days: 99, sort_order: 15 },
    { id: 17, slug: 'elevator', name: 'Elevator', description: 'The signature elevator: lift the contraction and hold at the top.', instructions: 'Follow the circle: contract when it says "Contract & hold", release when it says "Relax".', contract_seconds: 5, relax_seconds: 5, hold_seconds: 0, min_duration: 30, max_duration: 120, is_active: true, full_hold: false, start_phase: 'contract', contract_glow_mode: 'slowly', relax_glow_mode: 'slowly', contract_label: 'Contract & hold', relax_label: 'Relax', unlock_after_days: 109, sort_order: 16 },
];

export const SEED_LEVELS = [
    { id: 1, number: 1, name: 'Level 1', description: 'Gentle introduction - short sessions.', total_session_seconds: 60, rest_seconds: 4, min_exercises: 3, days_to_complete: 30, sessions_per_day: null },
    { id: 2, number: 2, name: 'Level 2', description: 'A little longer.', total_session_seconds: 120, rest_seconds: 6, min_exercises: 4, days_to_complete: 30, sessions_per_day: null },
    { id: 3, number: 3, name: 'Level 3', description: 'Balanced training for steady gains.', total_session_seconds: 180, rest_seconds: 8, min_exercises: 5, days_to_complete: 30, sessions_per_day: null },
    { id: 4, number: 4, name: 'Level 4', description: 'Longer sessions for stronger muscles.', total_session_seconds: 240, rest_seconds: 10, min_exercises: 6, days_to_complete: 30, sessions_per_day: null },
    { id: 5, number: 5, name: 'Level 5', description: 'Advanced endurance and control.', total_session_seconds: 300, rest_seconds: 12, min_exercises: 7, days_to_complete: 30, sessions_per_day: null },
];

export const SEED_ONBOARDING_SLIDES = [
    { id: 1, title: 'Improve health & perform better', icon: 'heart', body: 'Strengthen your pelvic floor muscles to enhance control, boost physical performance, and build core confidence that lasts.', cta_label: 'Next', sort_order: 0 },
    { id: 2, title: 'It takes only minutes', icon: 'clock', body: 'Each session is designed to fit your busy life. In just 3 to 5 minutes a day, you can complete your daily exercises anytime, anywhere.', cta_label: 'Next', sort_order: 1 },
    { id: 3, title: 'Track your progress', icon: 'chart', body: 'Watch your daily streak grow, measure your endurance improvements, and unlock new challenges as your pelvic floor gets stronger.', cta_label: 'Next', sort_order: 2 },
    { id: 4, title: 'Schedule your training', icon: 'calendar', body: 'Set smart, quiet reminders at times that suit you. Stay consistent, build a habit, and see real results over time.', cta_label: 'Get Started', sort_order: 3 },
];

export const SEED_KNOWLEDGE_LESSONS = [
    { id: 1, title: 'Where are your pelvic floor muscles?', description: 'Meet the hammock of muscles at the base of your pelvis and what they do.', video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', sort_order: 0 },
    { id: 2, title: 'How to find and feel them', description: 'Simple cues to locate the muscles and feel a correct contraction.', video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', sort_order: 1 },
    { id: 3, title: 'Why training matters', description: 'The benefits of a strong pelvic floor for control, core and confidence.', video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', sort_order: 2 },
    { id: 4, title: 'Doing your Kegels right', description: 'Breathing, common mistakes, and how to get the most from every session.', video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4', sort_order: 3 },
];

export const SEED_SETTINGS = {
    app_name: 'Kegelee',
    app_tagline: 'Train your pelvic floor',
    color_accent: '#E8202A',
    color_accent_soft: '#FF4D57',
    color_success: '#22C55E',
    color_bg: '#0C0D11',
    color_surface: '#16181F',
    color_surface_2: '#1E2128',
    color_text: '#FFFFFF',
    color_text_muted: '#8A8F98',
    circle_size: 220,
    circle_track_width: 9,
    circle_glow_enabled: true,
    circle_glow_color: '#E8202A',
    circle_animation_speed: 0.12,
    circle_glow_speed: 0.45,
    circle_time_scale: 0.7,
    haptics_enabled: true,
    sound_enabled: true,
    sessions_per_day: 2,
    plan_length_days: 30,
    onboarding_enabled: true,
};
