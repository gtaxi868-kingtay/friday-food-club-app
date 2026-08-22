import { useState } from 'react';
import { useQuery as useConvexQuery, useMutation as useConvexMutation } from 'convex/react';
import { api } from '@workspace/convex-backend/convex/_generated/api';
import { useSession } from '@/components/SessionProvider';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { MapPin, Plus, Trash2, Pin, UserMinus, ChevronDown, ChevronUp } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface PinnedChef {
  id: string;
  name: string;
  handle: string;
  isVerified: boolean;
}

interface Spot {
  id: string;
  name: string;
  address: string;
  region: string;
  lat: number | null;
  lng: number | null;
  isPinnable: boolean;
  createdAt: string;
  pinnedChefs: PinnedChef[];
}

interface ChefOption {
  id: string;
  name: string;
  handle: string;
  region: string;
  isVerified: boolean;
}

const TT_REGIONS = [
  'Port of Spain', 'San Fernando', 'Chaguanas', 'Arima',
  'Diego Martin', 'Maraval', 'Woodbrook', 'Couva',
  'Point Fortin', 'Tobago', 'Other',
];

// ── Sub-components ────────────────────────────────────────────────────────────

function SpotCard({
  spot,
  chefs,
  sessionToken,
  onDelete,
}: {
  spot: Spot;
  chefs: ChefOption[];
  sessionToken: string;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pinChefId, setPinChefId] = useState('');
  const { toast } = useToast();

  const pinChefMutation = useConvexMutation(api.locations.pinChef);
  const unpinChefMutation = useConvexMutation(api.locations.unpinChef);

  const pinMutation = {
    isPending: false,
    mutate: async (chefId: string) => {
      try {
        await pinChefMutation({ sessionToken, locationId: spot.id as any, chefId: chefId as any });
        setPinChefId('');
        toast({ title: 'Chef pinned', description: 'Chef is now a pinned subscriber at this spot.' });
      } catch {
        toast({ title: 'Error', description: 'Failed to pin chef.', variant: 'destructive' });
      }
    },
  };

  const unpinMutation = {
    isPending: false,
    mutate: async (chefId: string) => {
      try {
        await unpinChefMutation({ sessionToken, locationId: spot.id as any, chefId: chefId as any });
        toast({ title: 'Chef unpinned', description: 'Chef removed from this spot.' });
      } catch {
        toast({ title: 'Error', description: 'Failed to unpin chef.', variant: 'destructive' });
      }
    },
  };

  // Chefs not already pinned here
  const unpinnedChefs = chefs.filter(c => !spot.pinnedChefs.some(pc => pc.id === c.id));

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Top accent */}
      <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)' }} />

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-foreground truncate">{spot.name}</h3>
              {spot.isPinnable && (
                <Badge className="text-[10px] px-2 py-0.5 font-semibold tracking-wide"
                  style={{ background: 'rgba(212,175,55,0.15)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.3)' }}>
                  <Pin className="w-2.5 h-2.5 mr-1" />
                  PINNABLE
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{spot.address}</p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <MapPin className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{spot.region}</span>
              {spot.lat && spot.lng && (
                <span className="text-xs text-muted-foreground/50 ml-1">
                  {Number(spot.lat).toFixed(4)}, {Number(spot.lng).toFixed(4)}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-secondary/50"
            >
              <Pin className="w-3 h-3" />
              {spot.pinnedChefs.length} pinned
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Expanded: pinned chefs + assign */}
        {expanded && (
          <div className="mt-4 space-y-3 pt-4 border-t border-border/50">
            {spot.pinnedChefs.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No chefs pinned here yet.</p>
            ) : (
              <div className="space-y-2">
                {spot.pinnedChefs.map(chef => (
                  <div key={chef.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-secondary/30">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-black"
                        style={{ background: 'linear-gradient(135deg, #D4AF37, #9E8028)' }}>
                        {chef.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{chef.name}</p>
                        <p className="text-xs text-muted-foreground">{chef.handle}</p>
                      </div>
                      {chef.isVerified && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-primary border-primary/30">
                          Verified
                        </Badge>
                      )}
                    </div>
                    <button
                      onClick={() => unpinMutation.mutate(chef.id)}
                      disabled={unpinMutation.isPending}
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Assign a chef */}
            {spot.isPinnable && unpinnedChefs.length > 0 && (
              <div className="flex gap-2 mt-3">
                <Select value={pinChefId} onValueChange={setPinChefId}>
                  <SelectTrigger className="flex-1 h-9 text-sm">
                    <SelectValue placeholder="Select chef to pin…" />
                  </SelectTrigger>
                  <SelectContent>
                    {unpinnedChefs.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} · {c.region}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!pinChefId || pinMutation.isPending}
                  onClick={() => pinMutation.mutate(pinChefId)}
                  className="shrink-0"
                  style={{ background: 'linear-gradient(135deg, #D4AF37, #9E8028)', color: '#0A0A0A' }}
                >
                  <Pin className="w-3.5 h-3.5 mr-1.5" />
                  Pin Chef
                </Button>
              </div>
            )}
            {!spot.isPinnable && (
              <p className="text-xs text-muted-foreground/60 italic">
                Mark this spot as pinnable to assign pinned chef subscribers.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SpotsPanel() {
  const { toast } = useToast();
  const { token } = useSession();
  const sessionToken = token ?? '';
  const [showAdd, setShowAdd] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: '', address: '', region: '', lat: '', lng: '', isPinnable: false, nfcId: '',
  });

  const rawSpots = useConvexQuery(api.locations.list, token ? { sessionToken } : 'skip');
  const isLoading = !!token && rawSpots === undefined;
  const spots: Spot[] = (rawSpots ?? []).map((l: any) => ({
    id: l._id,
    name: l.name,
    address: l.address,
    region: l.region,
    lat: l.lat ?? null,
    lng: l.lng ?? null,
    isPinnable: l.isPinnable,
    createdAt: new Date(l._creationTime).toISOString(),
    pinnedChefs: (l.pinnedChefs ?? []).map((c: any) => ({ id: c.id, name: c.name, handle: c.handle, isVerified: c.isVerified })),
  }));

  const rawChefs = useConvexQuery(api.chefs.list, token ? {} : 'skip');
  const chefs: ChefOption[] = (rawChefs ?? []).map((c: any) => ({
    id: c._id, name: c.name, handle: c.handle, region: c.region, isVerified: c.isVerified,
  }));

  const createMutation = useConvexMutation(api.locations.create);
  const removeMutation = useConvexMutation(api.locations.remove);

  const addMutation = {
    isPending: false,
    mutate: async () => {
      try {
        await createMutation({
          sessionToken,
          name: form.name.trim(),
          address: form.address.trim(),
          region: form.region,
          lat: form.lat ? parseFloat(form.lat) : undefined,
          lng: form.lng ? parseFloat(form.lng) : undefined,
          isPinnable: form.isPinnable,
          nfcId: form.nfcId.trim() || undefined,
        });
        setShowAdd(false);
        setForm({ name: '', address: '', region: '', lat: '', lng: '', isPinnable: false, nfcId: '' });
        toast({ title: 'Spot added', description: 'New location saved to the network.' });
      } catch {
        toast({ title: 'Error', description: 'Failed to add spot.', variant: 'destructive' });
      }
    },
  };

  const deleteMutation = {
    mutate: async (id: string) => {
      try {
        await removeMutation({ sessionToken, locationId: id as any });
        toast({ title: 'Spot removed' });
      } catch {
        toast({ title: 'Error', description: 'Failed to remove spot.', variant: 'destructive' });
      }
    },
  };

  // Group spots by region
  const byRegion = spots.reduce<Record<string, Spot[]>>((acc, s) => {
    (acc[s.region] ??= []).push(s);
    return acc;
  }, {});

  const totalPinned = spots.reduce((n, s) => n + s.pinnedChefs.length, 0);

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <MapPin className="w-6 h-6 text-primary" />
            Spots & Locations
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage pickup venues across T&amp;T. Pinnable spots support permanent chef subscriptions
            — chefs pay a higher monthly rate to stay pinned at a location even without a live drop.
          </p>
        </div>
        <Button
          onClick={() => setShowAdd(true)}
          style={{ background: 'linear-gradient(135deg, #D4AF37, #9E8028)', color: '#0A0A0A' }}
          className="shrink-0 font-semibold gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Spot
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Spots', value: spots.length },
          { label: 'Pinnable Venues', value: spots.filter(s => s.isPinnable).length },
          { label: 'Pinned Chefs', value: totalPinned },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-xl border border-border bg-card px-5 py-4">
            <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-widest">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Spots list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : spots.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 flex flex-col items-center justify-center py-20 gap-3 text-center">
          <MapPin className="w-10 h-10 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">No spots saved yet</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Add the locations from your Google Maps list to start building the FFC spot network.
          </p>
          <Button onClick={() => setShowAdd(true)} variant="outline" size="sm" className="mt-2 gap-2">
            <Plus className="w-4 h-4" /> Add your first spot
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(byRegion).sort(([a], [b]) => a.localeCompare(b)).map(([region, regionSpots]) => (
            <div key={region}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">{region}</h2>
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-xs text-muted-foreground">{regionSpots.length} spot{regionSpots.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-3">
                {regionSpots.map(spot => (
                  <SpotCard
                    key={spot.id}
                    spot={spot}
                    chefs={chefs}
                    sessionToken={sessionToken}
                    onDelete={() => deleteMutation.mutate(spot.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Spot dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              Add a Spot
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Venue / Location Name</Label>
              <Input
                placeholder="e.g. The Alley, Ariapita Avenue"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Full Address</Label>
              <Input
                placeholder="Street address or landmark"
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Region</Label>
              <Select value={form.region} onValueChange={v => setForm(f => ({ ...f, region: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select region…" />
                </SelectTrigger>
                <SelectContent>
                  {TT_REGIONS.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Latitude <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  placeholder="10.6549"
                  value={form.lat}
                  onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Longitude <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  placeholder="-61.5019"
                  value={form.lng}
                  onChange={e => setForm(f => ({ ...f, lng: e.target.value }))}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              Paste coordinates from your Google Maps saved list — right-click any pin → "What's here?"
            </p>

            {/* NFC Tag ID */}
            <div className="space-y-1.5">
              <Label>NFC Tag ID <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                placeholder="e.g. 04:A3:B2:1C:DE:F0"
                value={form.nfcId}
                onChange={e => setForm(f => ({ ...f, nfcId: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                The UID from the physical NFC tag placed at this venue. Members who tap the tag will see drops from chefs pinned here.
              </p>
            </div>

            {/* Pinnable toggle */}
            <label className="flex items-start gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-secondary/30 transition-colors">
              <input
                type="checkbox"
                checked={form.isPinnable}
                onChange={e => setForm(f => ({ ...f, isPinnable: e.target.checked }))}
                className="mt-0.5 accent-primary"
              />
              <div>
                <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Pin className="w-3.5 h-3.5 text-primary" />
                  Pinnable venue
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Allows chefs to subscribe at a higher tier for a permanent location pin —
                  visible on the app even when they have no live drop.
                </p>
              </div>
            </label>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 font-semibold gap-2"
                style={{ background: 'linear-gradient(135deg, #D4AF37, #9E8028)', color: '#0A0A0A' }}
                disabled={!form.name || !form.address || !form.region || addMutation.isPending}
                onClick={() => addMutation.mutate()}
              >
                <MapPin className="w-4 h-4" />
                {addMutation.isPending ? 'Saving…' : 'Save Spot'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
