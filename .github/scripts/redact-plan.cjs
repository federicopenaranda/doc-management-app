// Hides personal email addresses before a Terraform plan is posted as a pull request comment.
// The repository is public, GitHub masks secrets in logs but not in comments, and some resource ids
// (an IAM member's, for example) end with the member's address.
// Service account addresses are kept: they are not personal and the plan needs them to be readable.
const EMAIL = /[\w.+-]+@(?!(?:[\w-]+\.)*gserviceaccount\.com\b)[\w-]+(?:\.[\w-]+)+/g;

module.exports = (text) => text.replace(EMAIL, '***');
