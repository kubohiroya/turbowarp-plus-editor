const reviews = new WeakMap();
const policies = new WeakMap();

export const getPlusReviewedMode = (security, url) => {
    const review = reviews.get(security);
    return review && review.get(url);
};

export const setPlusHostPolicy = (security, policy) => {
    if (policy) policies.set(security, policy);
    else policies.delete(security);
};

export const canLoadPlusExtension = (security, url) => {
    const policy = policies.get(security);
    return policy ? policy.call(security, url) : true;
};

export const beginPlusReview = (security, modes) => {
    if (reviews.has(security)) throw new Error('An extension review is already loading');
    reviews.set(security, modes);
    return () => reviews.delete(security);
};
