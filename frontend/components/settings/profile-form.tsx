"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { authApi, type Gender, type PublicUser } from "@/lib/api";
import { downscaleImage, validateImage } from "@/lib/image";

// Heavy / rarely used pieces stay out of the initial bundle.
const DobPicker = dynamic(() => import("./dob-picker"), {
  loading: () => <div className="h-8 w-full animate-pulse border bg-muted/40" />,
});
const EmailChangeDialog = dynamic(() => import("./email-change-dialog"));

const GENDERS: { value: Gender; label: string }[] = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Others" },
];

function errorTitle(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

export function ProfileForm({ user }: { user: PublicUser }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user.name ?? "");
  const [dob, setDob] = useState<string | null>(user.dateOfBirth);
  const [gender, setGender] = useState<Gender | null>(user.gender);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  const trimmed = name.trim();
  const dirty =
    trimmed !== (user.name ?? "") || dob !== user.dateOfBirth || gender !== user.gender;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed) return toast.add({ type: "error", title: "Enter your full name." });
    setSaving(true);
    try {
      await authApi.updateProfile({ name: trimmed, dateOfBirth: dob, gender });
      toast.add({ type: "success", title: "Profile updated." });
      router.refresh();
    } catch (err) {
      toast.add({ type: "error", title: errorTitle(err, "Could not update your profile.") });
    } finally {
      setSaving(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const invalid = validateImage(file);
    if (invalid) return toast.add({ type: "error", title: invalid });
    setAvatarBusy(true);
    try {
      await authApi.uploadAvatar(await downscaleImage(file));
      toast.add({ type: "success", title: "Profile picture updated." });
      router.refresh();
    } catch (err) {
      toast.add({ type: "error", title: errorTitle(err, "Could not upload the image.") });
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    try {
      await authApi.removeAvatar();
      router.refresh();
    } catch (err) {
      toast.add({ type: "error", title: errorTitle(err, "Could not remove the picture.") });
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      <div>
        <h3 className="text-sm font-medium">Profile</h3>
        <p className="text-muted-foreground">Update your photo and personal details.</p>
      </div>

      <div className="flex items-center gap-4">
        <UserAvatar user={user} className="size-16 text-lg" />
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => void onFile(e)}
          />
          <Button type="button" variant="outline" disabled={avatarBusy} onClick={() => fileRef.current?.click()}>
            {avatarBusy && <Spinner />}
            Upload photo
          </Button>
          {user.avatarUrl && (
            <Button type="button" variant="ghost" disabled={avatarBusy} onClick={() => void removeAvatar()}>
              Remove
            </Button>
          )}
        </div>
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Full name</FieldLabel>
          <Input
            id="name"
            autoComplete="name"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="email">Email address</FieldLabel>
          <div className="flex gap-2">
            <Input id="email" value={user.email ?? ""} readOnly disabled className="flex-1" />
            <Button type="button" variant="outline" onClick={() => setEmailOpen(true)}>
              Change
            </Button>
          </div>
        </Field>

        <Field>
          <FieldLabel htmlFor="dob">Date of birth</FieldLabel>
          <DobPicker id="dob" value={dob} onChange={setDob} />
        </Field>

        <Field>
          <FieldLabel htmlFor="gender">Gender</FieldLabel>
          <Select
            value={gender ?? ""}
            onValueChange={(v) => setGender((v || null) as Gender | null)}
            items={GENDERS}
          >
            <SelectTrigger id="gender" className="w-full">
              <SelectValue placeholder="Select gender" />
            </SelectTrigger>
            <SelectContent>
              {GENDERS.map((g) => (
                <SelectItem key={g.value} value={g.value}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={!dirty || saving} className="w-fit">
        {saving && <Spinner />}
        Save changes
      </Button>

      {emailOpen && (
        <EmailChangeDialog
          currentEmail={user.email}
          onClose={() => setEmailOpen(false)}
          onChanged={() => {
            setEmailOpen(false);
            toast.add({ type: "success", title: "Email address updated." });
            router.refresh();
          }}
        />
      )}
    </form>
  );
}
