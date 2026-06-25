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
    public $contract_seconds = 3;
    public $relax_seconds = 3;
    public $hold_seconds = 0;
    public string $contract_glow_mode = 'slowly';
    public string $relax_glow_mode = 'slowly';
    public string $start_phase = 'contract';
    public string $contract_label = 'Contract & hold';
    public string $relax_label = 'Relax';
    public bool $full_hold = false;
    public int $unlock_after_days = 0;
    public bool $is_active = true;
    public int $sort_order = 0;

    public $min_duration = 30;
    public $max_duration = 120;

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
                'contract_label', 'relax_label', 'full_hold', 'unlock_after_days', 'is_active', 'sort_order',
                'min_duration', 'max_duration',
            ]));
        } else {
            $this->sort_order = (int) Exercise::max('sort_order') + 1;
        }

        $this->updateCalculatedDurations();
    }

    public function removeIcon(): void
    {
        if ($this->exercise && $this->exercise->icon_path) {
            \Illuminate\Support\Facades\Storage::disk('public')->delete($this->exercise->icon_path);
            $this->exercise->update(['icon_path' => null]);
            $this->exercise = $this->exercise->fresh('levels');
        }
        $this->iconUpload = null;
    }

    public function removeVideo(): void
    {
        if ($this->exercise && $this->exercise->video_path) {
            \Illuminate\Support\Facades\Storage::disk('public')->delete($this->exercise->video_path);
            $this->exercise->update(['video_path' => null]);
            $this->exercise = $this->exercise->fresh('levels');
        }
        $this->videoUpload = null;
    }

    public function updatedMinDuration(): void
    {
        $this->updateCalculatedDurations();
    }

    public function updatedMaxDuration(): void
    {
        $this->updateCalculatedDurations();
    }

    public function updateCalculatedDurations(): void
    {
        $levels = Level::orderBy('number')->get();
        $minL = 1;
        $maxL = (int) ($levels->max('number') ?? 10);
        if ($maxL <= $minL) {
            $maxL = $minL + 1;
        }

        $minD = (float) $this->min_duration;
        $maxD = (float) $this->max_duration;

        $this->durations = [];
        foreach ($levels as $level) {
            $currentL = (int) $level->number;
            if ($currentL <= $minL) {
                $dur = $minD;
            } elseif ($currentL >= $maxL) {
                $dur = $maxD;
            } else {
                $pct = ($currentL - $minL) / ($maxL - $minL);
                $dur = $minD + $pct * ($maxD - $minD);
            }
            $this->durations[$level->id] = [
                'level' => $level->name,
                'total' => (float) $level->total_session_seconds,
                'duration' => round($dur),
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
            'min_duration' => 'required|numeric|min:1',
            'max_duration' => 'required|numeric|min:1|gte:min_duration',
            'iconUpload' => 'nullable|image|max:4096',
            'videoUpload' => 'nullable|mimetypes:video/mp4,video/quicktime,video/webm|max:51200',
        ];
    }

    public function save()
    {
        $this->validate();

        // Update durations array in real time
        $this->updateCalculatedDurations();

        // Per-level checks: the cycle must fit the duration, and the duration
        // must fit the level's total session time.
        $cycle = (float) $this->contract_seconds + (float) $this->hold_seconds + (float) $this->relax_seconds;
        foreach ($this->durations as $levelId => $row) {
            $duration = (float) $row['duration'];
            // A full-hold exercise fills the whole duration as one contraction,
            // so the contract+hold+relax cycle check doesn't apply.
            if (! $this->full_hold && $cycle > $duration + 1e-6) {
                $this->addError("min_duration", "Contract + hold + relax ({$cycle}s) does not fit {$row['level']}'s calculated duration ({$duration}s). Increase min/max duration or reduce contract/hold/relax times.");
                return;
            }
            if ($duration > (float) $row['total'] + 1e-6) {
                $this->addError("max_duration", "Calculated duration ({$duration}s) is longer than {$row['level']}'s session time ({$row['total']}s). Reduce max_duration.");
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
            'is_active' => $this->is_active,
            'sort_order' => $this->sort_order,
            'min_duration' => $this->min_duration,
            'max_duration' => $this->max_duration,
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
