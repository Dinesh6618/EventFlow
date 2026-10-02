import { useState } from 'react';
import { ApiError, teamsApi } from '../../api';
import { useToast } from '../../context/ToastContext.jsx';
import Button from '../ui/Button.jsx';
import { Input, Textarea } from '../ui/FormField.jsx';
import Modal from '../ui/Modal.jsx';
import TagInput from '../ui/TagInput.jsx';

/** Create a team (no `team`) or edit one (leader only). Calls onSaved(teamId) on success. */
export default function TeamForm({ eventId, team, onClose, onSaved }) {
  const toast = useToast();
  const [values, setValues] = useState({
    name: team?.name ?? '',
    projectTitle: team?.projectTitle ?? '',
    projectDescription: team?.projectDescription ?? '',
    repositoryUrl: team?.repositoryUrl ?? '',
    demoUrl: team?.demoUrl ?? '',
    skills: team?.skills ?? [],
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (values.name.trim().length < 2) {
      setErrors({ name: 'Team name must be at least 2 characters' });
      return;
    }
    const link = (v) => v.trim();
    const bad = (v) => v.trim() && !/^https?:\/\/\S+$/i.test(v.trim());
    if (bad(values.repositoryUrl) || bad(values.demoUrl)) {
      setErrors({
        ...(bad(values.repositoryUrl) && { repositoryUrl: 'Must start with http:// or https://' }),
        ...(bad(values.demoUrl) && { demoUrl: 'Must start with http:// or https://' }),
      });
      return;
    }
    setSaving(true);
    const body = {
      ...values,
      name: values.name.trim(),
      projectTitle: values.projectTitle.trim(),
      projectDescription: values.projectDescription.trim(),
      repositoryUrl: link(values.repositoryUrl),
      demoUrl: link(values.demoUrl),
    };
    try {
      if (team) {
        await teamsApi.update(team.id, body);
        toast.success('Team updated.');
        onSaved(team.id);
      } else {
        const { team: created } = await teamsApi.create(eventId, body);
        toast.success(`Team "${created.name}" created.`);
        onSaved(created.id);
      }
    } catch (err) {
      if (err instanceof ApiError && err.errors && Object.keys(err.errors).length) setErrors(err.errors);
      else toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={team ? 'Edit team' : 'Create a team'}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Input label="Team name" required value={values.name} onChange={set('name')} error={errors.name} maxLength={80} />
        <TagInput
          label="Skills you are looking for"
          hint="We use these to suggest teammates, for example UI/UX Designer or Python."
          value={values.skills}
          onChange={(skills) => setValues((v) => ({ ...v, skills }))}
        />
        <Input label="Project title" value={values.projectTitle} onChange={set('projectTitle')} maxLength={150} hint="You can fill this in later." />
        <Textarea label="Project description" rows={3} value={values.projectDescription} onChange={set('projectDescription')} />
        <Input label="Repository link" type="url" value={values.repositoryUrl} onChange={set('repositoryUrl')} error={errors.repositoryUrl} placeholder="https://github.com/..." hint="Judges open this to review your code." />
        <Input label="Demo link" type="url" value={values.demoUrl} onChange={set('demoUrl')} error={errors.demoUrl} placeholder="https://..." />
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving}>{team ? 'Save changes' : 'Create team'}</Button>
        </div>
      </form>
    </Modal>
  );
}
