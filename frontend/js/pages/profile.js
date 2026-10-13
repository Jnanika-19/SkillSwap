async function loadProfile() {
  const el = document.getElementById('page-profile');
  if (!el) return;
  el.innerHTML = loadingHTML();
  try {
    const { user } = await API.get(`/api/users/${Number(currentUser.user_id)}`);
    currentUser = { ...currentUser, ...user };
    updateSidebarUser();
    renderProfilePage(user);
  } catch (error) {
    el.innerHTML = `<p class="danger">${escapeHTML(error.message)}</p>`;
  }
}

function renderProfilePage(user) {
  const el = document.getElementById('page-profile');
  el.innerHTML = `
    <div class="page-header">
      <h1>My Profile</h1>
      <p>Update your photo and tell other students about yourself.</p>
    </div>
    <div class="profile-layout">
      <section class="profile-photo-card" aria-labelledby="profile-photo-heading">
        <h2 id="profile-photo-heading">Profile picture</h2>
        <div id="profile-picture-preview">${avatarMarkup(user.profile_picture, user.avatar || user.name.slice(0, 2), 'profile-avatar')}</div>
        <label for="profile-picture-file" class="field-label">Choose a picture</label>
        <input id="profile-picture-file" type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" />
        <p class="muted">PNG, JPG, or WebP. Maximum size 3 MB. Your photo is visible to other members.</p>
        <button type="button" class="btn-primary" onclick="saveProfilePicture(this)">Upload picture</button>
      </section>
      <form class="profile-edit-card" onsubmit="saveProfileDetails(event)">
        <h2>About you</h2>
        <div class="field"><label for="profile-name">Name</label><input id="profile-name" value="${escapeHTML(user.name)}" maxlength="100" required /></div>
        <div class="field"><label for="profile-department">Department</label><input id="profile-department" value="${escapeHTML(user.department || '')}" maxlength="60" placeholder="e.g. Computer Science" /></div>
        <div class="field"><label for="profile-bio">Description</label><textarea id="profile-bio" maxlength="2000" rows="6" placeholder="Share your interests, experience, and what you hope to learn.">${escapeHTML(user.bio || '')}</textarea><small>Up to 2,000 characters.</small></div>
        <button type="submit" class="btn-primary">Save profile</button>
      </form>
    </div>
    <section class="public-profile-preview" aria-label="How your profile appears to others">
      <h2>Profile preview</h2>
      <div class="public-profile-head">${avatarMarkup(user.profile_picture, user.avatar || user.name.slice(0, 2), 'profile-preview-avatar')}<div><strong>${escapeHTML(user.name)}</strong><div class="muted">${escapeHTML(user.department || 'Student')}</div></div></div>
      <p>${user.bio ? escapeHTML(user.bio) : '<span class="muted">Add a description so other students can learn about you.</span>'}</p>
    </section>`;

  const fileInput = document.getElementById('profile-picture-file');
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const preview = document.getElementById('profile-picture-preview');
    if (preview.dataset.previewUrl) URL.revokeObjectURL(preview.dataset.previewUrl);
    const url = URL.createObjectURL(file);
    preview.dataset.previewUrl = url;
    preview.innerHTML = `<div class="avatar profile-avatar"><img class="avatar-image" src="${url}" alt="Selected profile picture preview" /></div>`;
  });
}

async function saveProfileDetails(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const { user } = await API.updateProfile({
      name: document.getElementById('profile-name').value,
      department: document.getElementById('profile-department').value,
      bio: document.getElementById('profile-bio').value
    });
    currentUser = { ...currentUser, ...user };
    updateSidebarUser();
    showToast('Profile saved.');
    renderProfilePage(user);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function saveProfilePicture(button) {
  const input = document.getElementById('profile-picture-file');
  const file = input?.files?.[0];
  if (!file) return showToast('Choose a picture first.', 'error');
  const formData = new FormData();
  formData.append('avatar', file);
  button.disabled = true;
  try {
    const { user } = await API.uploadAvatar(formData);
    currentUser = { ...currentUser, ...user };
    updateSidebarUser();
    showToast('Profile picture updated.');
    renderProfilePage(user);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}
