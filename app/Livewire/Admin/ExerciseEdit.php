<?php

namespace App\Livewire\Admin;

use App\Models\Exercise;
use App\Models\Level;
use App\Services\SettingsService;
use Illuminate\Support\Str;
use Livewire\Attributes\Layout;
use Livewire\Component;
use Livewire\WithFileUploads;

#[Layout('components.layouts.admin')]
class ExerciseEdit extends Component
{
    use WithFileUploads;

    public ?Exercise $exercise = null;

    public string $name = '';
    public string $description = '';
    public string $instructions = '';
    public float $contract_seconds = 3;
    public float $relax_seconds = 3;
    public float $hold_seconds = 0;
    public string $contract_glow_mode = 'slowly';
    public string $relax_glow_mode = 'slowly';
    public string $start_phase = 'contract';
    public string $contract_label = 'Contract & hold';
    public string $relax_label = 'Relax';
    public bool $full_hold = false;
    public int $unlock_after_days = 0;
    public bool $is_premium = false;
    public bool $is_active = true;
    public int $sort_order = 0;

    /** @var array<int, array{level: string, total: float, duration: float}> keyed by level id */
    public array $durations = [];

    public $iconUpload = null;
    public $videoUpload = null;

    public ?string $savedMessage = null;

    public function mount(?Exercise $exercise = null): void
    {
        $levels = Level::orderBy('number')->get();

        if ($exercise && $exercise->exists) {
            $this->exercise = $exercise->load('levels');
            $this->fill($exercise->only([
                'name', 'description', 'instructions', 'contract_seconds', 'relax_seconds', 'hold_seconds',
                'contract_glow_mode', 'relax_glow_mode', 'start_phase',
                'contract_label', 'relax_label', 'full_hold', 'unlock_after_days', 'is_premium', 'is_active', 'sort_order',
            ]));
        } else {
            $this->sort_order = (int) Exercise::max('sort_order') + 1;
        }

        foreach ($levels as $level) {
            $pivot = $this->exercise?->levels->firstWhere('id', $level->id)?->pivot;
            $this->durations[$level->id] = [
                'level' => $level->name,
                'total' => (float) $level->total_session_seconds,
                'duration' => (float) ($pivot->duration_seconds ?? 30),
                // Whether this exercise is part of that level's session. Existing
                // exercises keep their current attachment; new ones default in.
                'included' => $this->exercise?->exists ? (bool) $pivot : true,
            ];
        }
    }

    protected function rules(): array
    {
        return [
            'name' => 'required|string|max:120',
            'description' => 'nullable|string',
            'instructions' => 'nullable|string',
            'contract_seconds' => 'required|numeric|min:0.1',
            'relax_seconds' => 'required|numeric|min:0',
            'hold_seconds' => 'required|numeric|min:0',
            'contract_glow_mode' => 'required|in:slowly,at_once,very_fast',
            'relax_glow_mode' => 'required|in:slowly,at_once,very_fast',
            'start_phase' => 'required|in:contract,relax',
            'contract_label' => 'required|string|max:60',
            'relax_label' => 'required|string|max:60',
            'full_hold' => 'boolean',
            'unlock_after_days' => 'required|integer|min:0',
            'sort_order' => 'required|integer|min:0',
            'durations.*.duration' => 'required|numeric|min:1',
            'iconUpload' => 'nullable|image|max:4096',
            'videoUpload' => 'nullable|mimetypes:video/mp4,video/quicktime,video/webm|max:51200',
        ];
    }

    public function save()
    {
        $this->validate();

        // Per-level checks: the cycle must fit the duration, and the duration
        // must fit the level's total session time.
        $cycle = (float) $this->contract_seconds + (float) $this->hold_seconds + (float) $this->relax_seconds;
        foreach ($this->durations as $levelId => $row) {
            // Only validate levels this exercise is actually assigned to.
            if (! ($row['included'] ?? true)) {
                continue;
            }
            $duration = (float) $row['duration'];
            // A full-hold exercise fills the whole duration as one contraction,
            // so the contract+hold+relax cycle check doesn't apply.
            if (! $this->full_hold && $cycle > $duration + 1e-6) {
                $this->addError("durations.{$levelId}.duration", "Contract + hold + relax ({$cycle}s) does not fit {$row['level']}'s duration ({$duration}s).");
                return;
            }
            if ($duration > (float) $row['total'] + 1e-6) {
                $this->addError("durations.{$levelId}.duration", "Longer than {$row['level']}'s session time ({$row['total']}s).");
                return;
            }
        }

        $exercise = $this->exercise ?? new Exercise();
        $exercise->fill([
            'name' => $this->name,
            'slug' => $exercise->slug ?: Str::slug($this->name).'-'.Str::random(4),
            'description' => $this->description,
            'instructions' => $this->instructions,
            'contract_seconds' => $this->contract_seconds,
            'relax_seconds' => $this->relax_seconds,
            'hold_seconds' => $this->hold_seconds,
            'contract_glow_mode' => $this->contract_glow_mode,
            'relax_glow_mode' => $this->relax_glow_mode,
            'start_phase' => $this->start_phase,
            'contract_label' => $this->contract_label,
            'relax_label' => $this->relax_label,
            'full_hold' => $this->full_hold,
            'unlock_after_days' => $this->unlock_after_days,
            'is_premium' => $this->is_premium,
            'is_active' => $this->is_active,
            'sort_order' => $this->sort_order,
        ]);

        if ($this->iconUpload) {
            $exercise->icon_path = $this->iconUpload->store('exercises/icons', 'public');
        }
        if ($this->videoUpload) {
            $exercise->video_path = $this->videoUpload->store('exercises/videos', 'public');
        }

        $exercise->save();

        $sync = [];
        foreach ($this->durations as $levelId => $row) {
            // Attach only the levels this exercise is included in.
            if (! ($row['included'] ?? true)) {
                continue;
            }
            $sync[$levelId] = ['duration_seconds' => (float) $row['duration']];
        }
        $exercise->levels()->sync($sync);

        $this->exercise = $exercise->load('levels');
        $this->iconUpload = null;
        $this->videoUpload = null;
        $this->savedMessage = 'Saved.';
    }

    public function render(SettingsService $settings)
    {
        // Level 1 duration for the preview arc.
        $level1Duration = count($this->durations)
            ? (float) array_values($this->durations)[0]['duration']
            : 30.0;

        return view('livewire.admin.exercise-edit', [
            'glowEnabled'    => (bool) $settings->get('circle_glow_enabled'),
            'circleSize'     => (int)  $settings->get('circle_size', 220),
            'trackWidth'     => (int)  $settings->get('circle_track_width', 9),
            'animationSpeed' => (float) $settings->get('circle_animation_speed', 0.12),
            'glowSpeed'      => (float) $settings->get('circle_glow_speed', 0.45),
            'timeScale'      => (float) $settings->get('circle_time_scale', 0.7),
            'level1Duration' => $level1Duration,
        ]);
    }
}
